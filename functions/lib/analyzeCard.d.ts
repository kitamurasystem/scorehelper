import { z } from 'genkit';
export declare const CardParseSchema: z.ZodObject<{
    className: z.ZodString;
    playerName: z.ZodString;
    playerId: z.ZodString;
    affiliation: z.ZodNullable<z.ZodString>;
    rounds: z.ZodArray<z.ZodObject<{
        round: z.ZodNumber;
        result: z.ZodEnum<["〇", "×"]>;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        round: number;
        result: "〇" | "×";
        score: number;
    }, {
        round: number;
        result: "〇" | "×";
        score: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    className: string;
    playerName: string;
    playerId: string;
    affiliation: string | null;
    rounds: {
        round: number;
        result: "〇" | "×";
        score: number;
    }[];
}, {
    className: string;
    playerName: string;
    playerId: string;
    affiliation: string | null;
    rounds: {
        round: number;
        result: "〇" | "×";
        score: number;
    }[];
}>;
export type CardParseResult = z.infer<typeof CardParseSchema>;
/**
 * 画像解析関数
 * @param imageUrl 解析対象画像の HTTPS URL
 */
export declare function analyzeCard(imageUrl: string): Promise<CardParseResult>;
