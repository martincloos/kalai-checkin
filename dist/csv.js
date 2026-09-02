// Parser de CSV chico y a mano, sin dependencias nuevas. Portado tal cual
// desde management-site/src/lib/csv.ts, que es su origen — el scaffold
// descartado de checkin-mvp lo había copiado de ahí, no al revés.
//
// Detecta ',' vs ';' por el header y soporta celdas entre comillas. El
// formato real de los clubes es plano, sin saltos de línea dentro de una
// celda.
function detectDelimiter(headerLine) {
    const commas = (headerLine.match(/,/g) || []).length;
    const semicolons = (headerLine.match(/;/g) || []).length;
    return semicolons > commas ? ';' : ',';
}
function parseLine(line, delimiter) {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                cur += ch;
            }
        }
        else if (ch === '"') {
            inQuotes = true;
        }
        else if (ch === delimiter) {
            cells.push(cur);
            cur = '';
        }
        else {
            cur += ch;
        }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
}
export function parseCsv(text) {
    const cleaned = text.replace(/^﻿/, '');
    const lines = cleaned.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
    if (lines.length === 0)
        return { headers: [], rows: [] };
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseLine(lines[0], delimiter);
    const rows = lines.slice(1).map((l) => parseLine(l, delimiter));
    return { headers, rows };
}
function normalize(s) {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}
/**
 * Sugiere, para cada columna del CSV, a qué campo corresponde. El staff
 * confirma o corrige el mapeo antes de importar: los nombres y el orden
 * exactos de las columnas del club no están confirmados, así que el
 * importador nunca depende de una posición fija.
 */
export function guessFieldMap(headers, aliasesByField) {
    const map = {};
    headers.forEach((h, i) => {
        const n = normalize(h);
        for (const [field, aliases] of Object.entries(aliasesByField)) {
            if (aliases.some((a) => normalize(a) === n)) {
                map[i] = field;
                return;
            }
        }
    });
    return map;
}
/**
 * Acepta YYYY-MM-DD o DD/MM/YYYY (formato común de planillas argentinas).
 * Cualquier otra cosa devuelve null en vez de guardar una fecha
 * incorrecta.
 */
export function parseFlexibleDate(raw) {
    const s = raw.trim();
    if (!s)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s))
        return s;
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
}
