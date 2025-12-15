/**
 * @file sanitize.ts
 * @module utils/sanitize
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Filename sanitization utilities for safe filesystem operations.
 */

/**
 * Sanitizes a string for safe use as a filename.
 *
 * Handles:
 * - Method signatures: `init(frame:)` → `init_frame`
 * - Invalid characters: `<>:"/\|?*` → `_`
 * - Whitespace collapsing
 * - Length truncation (max 100 chars)
 * - Case normalization (lowercase)
 *
 * @param name - Raw name to sanitize
 * @returns Safe filename string
 */
export function sanitizeFileName(name: string): string {
    let sanitized = name;

    // Handle method signatures: convert parameters to underscore-separated format
    // e.g., init(frame:) → init_frame, perform(_:with:afterDelay:) → perform_with_afterdelay
    if (sanitized.includes('(')) {
        const parenIndex = sanitized.indexOf('(');
        const methodName = sanitized.substring(0, parenIndex);
        const paramsSection = sanitized.substring(parenIndex);

        // Extract parameter labels from signature
        // Matches patterns like: (frame:), (_:with:afterDelay:), (to encoder:)
        const paramLabels = paramsSection
            .replace(/[()]/g, '') // Remove parentheses
            .split(':') // Split by colons
            .map(p => p.trim().split(/\s+/).pop() || '') // Get the label (last word before colon)
            .filter(p => p && p !== '_') // Remove empty and underscore-only labels
            .join('_');

        sanitized = paramLabels ? `${methodName}_${paramLabels}` : methodName;
    }

    // Remove or replace invalid characters
    sanitized = sanitized
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/__+/g, '_')
        .replace(/^_+|_+$/g, '');

    // Truncate very long names
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100);
    }

    // Ensure non-empty
    if (!sanitized) {
        sanitized = 'unnamed';
    }

    // Lowercase for case-insensitive consistency across filesystems
    return sanitized.toLowerCase();
}
