export declare function parseCsv(text: string): {
    headers: string[];
    rows: string[][];
};
/**
 * Sugiere, para cada columna del CSV, a qué campo corresponde. El staff
 * confirma o corrige el mapeo antes de importar: los nombres y el orden
 * exactos de las columnas del club no están confirmados, así que el
 * importador nunca depende de una posición fija.
 */
export declare function guessFieldMap(headers: string[], aliasesByField: Record<string, string[]>): Record<number, string>;
/**
 * Acepta YYYY-MM-DD o DD/MM/YYYY (formato común de planillas argentinas).
 * Cualquier otra cosa devuelve null en vez de guardar una fecha
 * incorrecta.
 */
export declare function parseFlexibleDate(raw: string): string | null;
