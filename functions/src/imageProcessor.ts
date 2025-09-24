import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { StorageObjectData } from "firebase-functions/storage";

const visionClient = new ImageAnnotatorClient();

export interface GameResult {
  round: number; // 1-6
  opponentClub: string;
  opponentName: string;
  isWin: boolean; // true=勝ち系, false=負け系
  scoreDiff: number; // 枚数差
  resultType: 'normal' | 'forfeit'; // normal=通常戦, forfeit=不戦勝
}

export interface PlayerCard {
  className: string; // "A", "B2", "D21"など
  club: string; // 所属会（"会"のみの場合は空文字）
  playerName: string;
  school: string; // 学校名（なければ空文字）
  furigana: string; // ふりがな（なければ空文字）
  playerId: string; // 数字のみ
  gameResults: GameResult[]; // 最大6試合分
}

export interface ProcessResult {
  newFilePath: string;
  fullText: string;
}

interface Word {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShimeiMarker {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function processImage(
  object: StorageObjectData
): Promise<ProcessResult> {
  const bucket = admin.storage().bucket(object.bucket!);
  const filePath = object.name!;
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  // --- 1. ダウンロード ---
  await bucket.file(filePath).download({ destination: tempFilePath });

  // --- 2. 回転角度計算用の予備OCR ---
  const [prelimResult] = await visionClient.textDetection(tempFilePath);
  const prelimAnnotations = prelimResult.fullTextAnnotation;

  // --- 3. 回転角度計算 ---
  const angles: number[] = [];
  prelimAnnotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const dx = box[1].x! - box[0].x!;
            const dy = box[1].y! - box[0].y!;
            angles.push((Math.atan2(dy, dx) * 180) / Math.PI);
          }
        })
      )
    )
  );
  const rotateAngle =
    angles.length > 0
      ? angles.sort((a, b) => a - b)[Math.floor(angles.length / 2)]
      : 0;

  // --- 4. 回転 & JPEG化 ---
  const rotatedPath = path.join(os.tmpdir(), "rotated.jpg");
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 90 }).toFile(rotatedPath);

  // --- 5. 回転後画像でOCR（最終処理用） ---
  const [result] = await visionClient.textDetection(rotatedPath);
  const annotations = result.fullTextAnnotation;

  const words: Word[] = [];
  annotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
          const text = word.symbols?.map((s) => s.text).join("") || "";
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const x = Math.min(...box.map(v => v.x || 0));
            const y = Math.min(...box.map(v => v.y || 0));
            const width = Math.max(...box.map(v => v.x || 0)) - x;
            const height = Math.max(...box.map(v => v.y || 0)) - y;
            words.push({ text, x, y, width, height });
          }
        })
      )
    )
  );
  console.log("words: ", words);

  // --- 6. カードごとに分割 ---
  const cardClusters = clusterWordsByCard(words);
  
  // デバッグ情報をログ出力
  console.log(`検出されたカード数: ${cardClusters.length}`);
  cardClusters.forEach((cluster, index) => {
    const shimeiMarkers = findShimeiMarkers([cluster]);
    const classWords = cluster.filter(w => w.text.includes("級"));
    console.log(`カード${index + 1}: 単語数=${cluster.length}, 氏名マーカー数=${shimeiMarkers.length}, クラス=${classWords.map(w => w.text).join(',')}`);
  });

  // --- 7. 各カードを解析 ---
  const cards: PlayerCard[] = cardClusters.map((cardWords) => 
    analyzeCard(cardWords)
  );

  const fullText = JSON.stringify(cards, null, 2);

  // --- 8. ファイル名生成 ---
  const classStr = cards.map((c) => c.className).join("-") || "UNKNOWN";
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  let index = 1;
  let newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  const dir = "uploads";

  while (await bucket.file(path.join(dir, newFileName)).exists().then((r) => r[0])) {
    index++;
    newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  }
  const newFilePath = path.join(dir, newFileName);

  // --- 9. デバッグ用：検出領域を可視化した画像を作成 ---
  const debugImagePath = await createDebugImage(rotatedPath, words, cardClusters);
  const debugFileName = `debug_${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  const debugFilePath = path.join(dir, debugFileName);
  
  await bucket.upload(debugImagePath, {
    destination: debugFilePath,
    contentType: "image/jpeg"
  });

  // --- 10. 元画像もアップロード ---
  await bucket.upload(rotatedPath, {
    destination: newFilePath,
    contentType: "image/jpeg"
  });

  // --- 11. 元ファイル削除 ---
  await bucket.file(filePath).delete();

  // --- 12. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);
  await fs.promises.unlink(debugImagePath);

  return { newFilePath, fullText };
}

// 「氏名」マーカーを検出する関数（分解された文字も対応）
function findShimeiMarkers(wordClusters: Word[][]): ShimeiMarker[] {
  const markers: ShimeiMarker[] = [];
  
  wordClusters.forEach(words => {
    // まず単一単語での「氏名」検索
    const directMarkers = words.filter(w => 
      w.text.includes("氏名") || w.text === "氏名"
    );
    
    directMarkers.forEach(marker => {
      markers.push({
        text: "氏名",
        x: marker.x,
        y: marker.y,
        width: marker.width,
        height: marker.height
      });
    });
    
    // 分解された「氏」「名」の組み合わせを検索
    if (directMarkers.length === 0) {
      const shiWords = words.filter(w => w.text === "氏");
      const meiWords = words.filter(w => w.text === "名");
      
      shiWords.forEach(shi => {
        // 「氏」の右側近くにある「名」を探す
        const nearbyMei = meiWords.find(mei => {
          const horizontalDistance = Math.abs(mei.x - (shi.x + shi.width));
          const verticalDistance = Math.abs(mei.y - shi.y);
          
          // 水平方向の距離が文字幅の4倍以内、垂直方向の距離が文字高の75%以内
          return horizontalDistance <= shi.width * 4.5 && 
                 verticalDistance <= shi.height * 0.75 &&
                 mei.x > shi.x; // 「名」が「氏」の右側にある
        });
        
        if (nearbyMei) {
          // 「氏名」として結合したマーカーを作成
          const minX = Math.min(shi.x, nearbyMei.x);
          const maxX = Math.max(shi.x + shi.width, nearbyMei.x + nearbyMei.width);
          const minY = Math.min(shi.y, nearbyMei.y);
          const maxY = Math.max(shi.y + shi.height, nearbyMei.y + nearbyMei.height);
          
          markers.push({
            text: "氏名",
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
          });
        }
      });
    }
  });
  
  return markers;
}

async function createDebugImage(imagePath: string, words: Word[], cardClusters: Word[][]): Promise<string> {
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
  const debugPath = path.join(os.tmpdir(), "debug.jpg");
  
  // 元画像を読み込んでSVGオーバーレイを作成
  const { width, height } = await sharp(imagePath).metadata();
  
  let svgOverlay = `<svg width="${width}" height="${height}">`;
  
  // 氏名マーカーを検出
  const shimeiMarkers = findShimeiMarkers(cardClusters);
  
  // 各カードクラスターを異なる色で描画
  cardClusters.forEach((cluster, cardIndex) => {
    const color = colors[cardIndex % colors.length];
    
    if (cluster.length === 0) return;
    
    // 各文字の枠を細い線で囲む
    cluster.forEach(word => {
      svgOverlay += `<rect x="${word.x}" y="${word.y}" width="${word.width}" height="${word.height}" 
        fill="none" stroke="${color}" stroke-width="1"/>`;
    });
    
    // カードの領域を計算
    const minX = Math.min(...cluster.map(w => w.x));
    const maxX = Math.max(...cluster.map(w => w.x + w.width));
    const minY = Math.min(...cluster.map(w => w.y));
    const maxY = Math.max(...cluster.map(w => w.y + w.height));
    
    // カード領域を矩形で囲む
    svgOverlay += `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" 
      fill="none" stroke="${color}" stroke-width="3"/>`;
    
    // カード番号を表示
    svgOverlay += `<text x="${minX + 10}" y="${minY + 30}" fill="${color}" 
      font-size="20" font-weight="bold">Card ${cardIndex + 1}</text>`;
  });
  
  // 氏名マーカーを強調表示
  shimeiMarkers.forEach(marker => {
    svgOverlay += `<rect x="${marker.x - 5}" y="${marker.y - 5}" width="${marker.width + 10}" height="${marker.height + 10}" 
      fill="none" stroke="#FF6600" stroke-width="4"/>`;
    svgOverlay += `<text x="${marker.x}" y="${marker.y - 10}" fill="#FF6600" 
      font-size="16" font-weight="bold">氏名</text>`;
  });
  
  svgOverlay += '</svg>';
  
  // 元画像にSVGオーバーレイを合成
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(debugPath);
    
  return debugPath;
}

function clusterWordsByCard(words: Word[]): Word[][] {
  if (words.length === 0) return [];

  // 氏名マーカーを検出
  const shimeiMarkers = findShimeiMarkers([words]);
  
  if (shimeiMarkers.length === 0) {
    // フォールバック：従来のx座標クラスタリング
    return clusterByXCoordinate(words);
  }

  const cardClusters: Word[][] = [];
  
  // マーカーをy座標でソートして上から処理
  const sortedMarkers = shimeiMarkers.sort((a, b) => a.y - b.y);
  
  sortedMarkers.forEach(marker => {
    // カードサイズを推定（縦横比を利用）
    // 氏名は左上にあるので、マーカーから推定してカード領域を設定
    const estimatedCardHeight = marker.height * 18; // 氏名の高さから推定倍率
    const estimatedCardWidth = estimatedCardHeight * 1.65; // 縦横比1.65:1を想定
    
    // マーカーが左上にあることを前提として、カード領域を設定
    const cardLeft = marker.x - estimatedCardWidth * 0.02; // マーカーから左に2%
    const cardRight = marker.x + estimatedCardWidth * 0.98; // マーカーから右に98%
    const cardTop = marker.y - estimatedCardHeight * 0.05; // マーカーから上に5%
    const cardBottom = marker.y + estimatedCardHeight * 0.95; // マーカーから下に95%
    
    // この領域内の単語をカードとしてグループ化
    const cardWords = words.filter(w => {
      return w.x >= cardLeft && w.x <= cardRight && 
             w.y >= cardTop && w.y <= cardBottom;
    });

    if (cardWords.length > 0) {
      cardClusters.push(cardWords);
    }
  });

  // 重複除去：同じ単語が複数のカードに含まれている場合、より近いカードに割り当て
  // const usedWords = new Set<Word>();
  // const finalClusters: Word[][] = [];

  // cardClusters.forEach(cluster => {
  //   const uniqueWords = cluster.filter(w => !usedWords.has(w));
  //   if (uniqueWords.length > 0) {
  //     finalClusters.push(uniqueWords);
  //     uniqueWords.forEach(w => usedWords.add(w));
  //   }
  // });

  // return finalClusters;
  
  // 重複除去を一旦無効化
  return cardClusters;
}

// フォールバック用の従来のクラスタリング
function clusterByXCoordinate(words: Word[]): Word[][] {
  const sortedWords = [...words].sort((a, b) => a.x - b.x);
  const clusters: Word[][] = [];
  const threshold = 100;

  sortedWords.forEach((word) => {
    let added = false;
    for (const cluster of clusters) {
      const avgX = cluster.reduce((sum, w) => sum + w.x, 0) / cluster.length;
      if (Math.abs(word.x - avgX) < threshold) {
        cluster.push(word);
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push([word]);
    }
  });

  return clusters;
}

function analyzeCard(words: Word[]): PlayerCard {
  if (words.length === 0) {
    return createEmptyCard();
  }

  // カードの境界を計算
  const minX = Math.min(...words.map(w => w.x));
  const maxX = Math.max(...words.map(w => w.x + w.width));
  const minY = Math.min(...words.map(w => w.y));
  const maxY = Math.max(...words.map(w => w.y + w.height));
  const cardWidth = maxX - minX;
  const cardHeight = maxY - minY;
  const centerX = minX + cardWidth * 0.58; // 左から幅の58%を左右境界とする

  // 右半分と左半分に分割
  const rightWords = words.filter(w => w.x >= centerX);
  const leftWords = words.filter(w => w.x < centerX);

  // 右半分から選手情報を抽出
  const playerInfo = extractPlayerInfo(rightWords, minY, cardHeight);

  // 左半分から戦績情報を抽出
  const gameResults = extractGameResults(leftWords, minY, cardHeight);

  return {
    ...playerInfo,
    gameResults
  };
}

function extractPlayerInfo(words: Word[], cardMinY: number, cardHeight: number): Omit<PlayerCard, 'gameResults'> {
  // 上部30%を所属情報エリア、下部70%を選手情報エリアとする
  const clubAreaMaxY = cardMinY + cardHeight * 0.3;
  const clubWords = words.filter(w => w.y <= clubAreaMaxY);
  const playerWords = words.filter(w => w.y > clubAreaMaxY);

  // クラス名を抽出（「級」を含む文字列）
  let className = "UNKNOWN";
  for (const word of clubWords) {
    const classMatch = word.text.match(/([A-E]\d*)級/);
    if (classMatch) {
      className = classMatch[1];
      break;
    }
  }

  // 所属会を抽出（「◯◯会」の形式）
  let club = "";
  for (const word of clubWords) {
    const clubMatch = word.text.match(/(.+)会/);
    if (clubMatch && clubMatch[1] !== "") {
      club = clubMatch[1] + "会";
      break;
    }
  }

  // 選手IDを抽出（「ID:数字」の形式）
  let playerId = "0000";
  for (const word of [...clubWords, ...playerWords]) {
    const idMatch = word.text.match(/ID:(\d+)/);
    if (idMatch) {
      playerId = idMatch[1];
      break;
    }
  }

  // 選手名、学校名、ふりがなを抽出
  // IDと所属会以外の文字列から推定
  const playerTexts = playerWords
    .filter(w => !w.text.includes("ID:") && !w.text.includes("級") && w.text !== "氏名" && w.text !== "氏" && w.text !== "名")
    .sort((a, b) => a.y - b.y)
    .map(w => w.text);

  // 簡易的に最初の文字列を選手名とする（実際はより複雑な解析が必要）
  const playerName = playerTexts.length > 0 ? playerTexts[0] : "";
  
  // 学校名とふりがなの判定（ひらがな・カタカナは仮名、漢字混じりは学校名）
  let school = "";
  let furigana = "";
  
  for (let i = 1; i < playerTexts.length; i++) {
    const text = playerTexts[i];
    if (/^[\u3040-\u309F\u30A0-\u30FF]+$/.test(text)) {
      furigana = text;
    } else if (/[一-龯]/.test(text)) {
      school = text;
    }
  }

  return {
    className,
    club,
    playerName,
    school,
    furigana,
    playerId
  };
}

function extractGameResults(words: Word[], cardMinY: number, cardHeight: number): GameResult[] {
  if (words.length === 0) return [];

  const gameResults: GameResult[] = [];
  
  // 左半分を6段に分割
  for (let round = 1; round <= 6; round++) {
    const roundStartY = cardMinY + ((round - 1) * cardHeight) / 6;
    const roundEndY = cardMinY + (round * cardHeight) / 6;
    
    const roundWords = words.filter(w => 
      w.y >= roundStartY && w.y < roundEndY
    );

    if (roundWords.length === 0) continue;

    // この段の戦績を解析
    const gameResult = analyzeRoundResult(round, roundWords);
    if (gameResult) {
      gameResults.push(gameResult);
    }
  }

  return gameResults;
}

function analyzeRoundResult(round: number, words: Word[]): GameResult | null {
  // 相手所属会の判定（「会」が含まれているか）
  const clubWords = words.filter(w => w.text.includes("会"));
  const opponentClub = clubWords.length > 0 && clubWords[0].text !== "会" ? clubWords[0].text : "";
  
  // 相手選手名の抽出（所属会以外の小さな文字）
  const nameWords = words.filter(w => !w.text.includes("会") && !w.text.includes("回戦") && 
    !w.text.match(/[◯✕]/) && !w.text.match(/\d/) && !w.text.includes("不"));
  const opponentName = nameWords.length > 0 ? nameWords.map(w => w.text).join("") : "";

  // 戦績の判定
  let isWin = false;
  let scoreDiff = 0;
  let resultType: 'normal' | 'forfeit' = 'normal';

  // 不戦勝の判定（「不」が含まれる）
  const forfeitWords = words.filter(w => w.text.includes("不"));
  if (forfeitWords.length > 0) {
    isWin = true;
    resultType = 'forfeit';
    scoreDiff = 0; // 基本は0、将来的に変更可能
  } else {
    // 通常戦の判定
    const winWords = words.filter(w => w.text.includes("◯"));
    const loseWords = words.filter(w => w.text.includes("✕"));
    
    if (winWords.length > 0) {
      isWin = true;
    } else if (loseWords.length > 0) {
      isWin = false;
    } else {
      // 勝敗が不明な場合はスキップ
      return null;
    }

    // 枚数差の抽出
    const numberWords = words.filter(w => w.text.match(/^\d+$/));
    if (numberWords.length > 0) {
      scoreDiff = parseInt(numberWords[0].text, 10) || 0;
    }
  }

  // 対戦相手の情報がない場合（未記入）はスキップ
  if (opponentClub === "" && opponentName === "") {
    return null;
  }

  return {
    round,
    opponentClub,
    opponentName,
    isWin,
    scoreDiff,
    resultType
  };
}

function createEmptyCard(): PlayerCard {
  return {
    className: "UNKNOWN",
    club: "",
    playerName: "",
    school: "",
    furigana: "",
    playerId: "0000",
    gameResults: []
  };
}