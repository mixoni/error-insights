import { model, Schema } from "mongoose";

const RawEventSchema = new Schema(
    {
        timestamp: { type: Date, required: true, index: true },
        userId: { type: String, index: true },
        browser: String,
        url: String,
        errorMessage: { type: String, required: true },
        stackTrace: String,
        raw: { type: Object, required: true }
    },
    { timestamps: true }
    );
    
    
export type RawEventDoc = {
    timestamp: Date;
    userId?: string;
    browser?: string;
    url?: string;
    errorMessage: string;
    stackTrace?: string;
    raw: unknown;
};


export const RawEvent = model<RawEventDoc>('RawEvent', RawEventSchema);