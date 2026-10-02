import { DEFAULT_CONVERT, type ConvertOptions, type TextInventory } from "../../shared/fs/text-convert.js";
export interface InventoryRow extends TextInventory {
    readonly path: string;
    readonly size: number;
    readonly encoding: string;
    readonly bom: boolean;
}
export function BatchTextConverterTool_trackRow(_index: number, row: InventoryRow): string { return row.path; }
