// interface 定義
export interface UploadRecord extends UploadRecordRaw {
  key?: string;
  formattedParsedAt?: string;
}

export interface UploadRecordRaw {
  uid: string;
  classesName?: string;
  round?: number;
  fullText?: string;
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  createdAt: number;
  parsedAt?: number;
  uploadType?: string;
}

export interface ClassCounts {
  class_A: number;
  class_B: number;
  class_C: number;
  class_D: number;
  class_E: number;
  class_F: number;
}
