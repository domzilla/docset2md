/**
 * @file typeNormalizer.ts
 * @module utils/typeNormalizer
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Type normalization utilities for docset entry types.
 */

/**
 * Maps short type codes to normalized full names.
 * Combines mappings from both StandardDash and CoreData formats.
 */
const TYPE_MAP: Record<string, string> = {
    // Common types
    func: 'Function',
    cl: 'Class',
    clm: 'Method',
    clconst: 'Constant',
    tdef: 'Type',
    macro: 'Macro',
    cat: 'Category',
    instm: 'Method',
    instp: 'Property',
    intf: 'Interface',
    struct: 'Struct',
    enum: 'Enum',
    union: 'Union',
    var: 'Variable',
    const: 'Constant',
    // CoreData specific
    file: 'File',
    keyword: 'Keyword',
    attribute: 'Attribute',
    guide: 'Guide',
};

/**
 * Maps normalized types to possible original forms.
 * Used for building SQL queries that match multiple type codes.
 */
const REVERSE_MAP: Record<string, string[]> = {
    Function: ['Function', 'func'],
    Class: ['Class', 'cl'],
    Method: ['Method', 'clm', 'instm'],
    Constant: ['Constant', 'clconst', 'const'],
    Type: ['Type', 'tdef'],
    Macro: ['Macro', 'macro'],
    Category: ['Category', 'cat'],
    Property: ['Property', 'instp'],
    Interface: ['Interface', 'intf'],
    Struct: ['Struct', 'struct'],
    Enum: ['Enum', 'enum'],
    Union: ['Union', 'union'],
    Variable: ['Variable', 'var'],
    File: ['File', 'file'],
    Keyword: ['Keyword', 'keyword'],
    Attribute: ['Attribute', 'attribute'],
    Guide: ['Guide', 'guide'],
};

/**
 * Normalize a type code to its full name.
 *
 * Converts short type codes (func, cl, clm) to full names (Function, Class, Method).
 *
 * @param type - Raw type from database
 * @returns Normalized type name
 *
 * @example
 * ```typescript
 * normalizeType('func')  // 'Function'
 * normalizeType('clm')   // 'Method'
 * normalizeType('Class') // 'Class' (unchanged)
 * ```
 */
export function normalizeType(type: string): string {
    const lower = type.toLowerCase();
    return TYPE_MAP[lower] || type;
}

/**
 * Get all possible original type codes for a normalized type.
 *
 * Used when building SQL queries to match entries with either
 * the normalized or original type name.
 *
 * @param type - Normalized type name
 * @returns Array of possible original type names
 *
 * @example
 * ```typescript
 * denormalizeTypes('Method')  // ['Method', 'clm', 'instm']
 * denormalizeTypes('Class')   // ['Class', 'cl']
 * ```
 */
export function denormalizeTypes(type: string): string[] {
    return REVERSE_MAP[type] || [type];
}

/**
 * Get a single denormalized type code for a normalized type.
 *
 * Returns the first short code if available, otherwise the type itself.
 *
 * @param type - Normalized type name
 * @returns Original type code for database query
 *
 * @example
 * ```typescript
 * denormalizeType('Function') // 'func'
 * denormalizeType('Class')    // 'cl'
 * denormalizeType('Unknown')  // 'Unknown'
 * ```
 */
export function denormalizeType(type: string): string {
    const codes = REVERSE_MAP[type];
    // Return the short code (second element) if available, otherwise the type
    return codes?.[1] || type;
}
