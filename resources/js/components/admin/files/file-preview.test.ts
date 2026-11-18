import { File, FileSpreadsheet, FileText } from 'lucide-react';
import { describe, expect, it } from 'vite-plus/test';
import { fileIconForExtension } from './file-preview';

describe('fileIconForExtension', () => {
    it('maps common extensions to Lucide File* icons', () => {
        expect(fileIconForExtension('pdf')).toBe(FileText);
        expect(fileIconForExtension('XLSX')).toBe(FileSpreadsheet);
        expect(fileIconForExtension('unknown-ext')).toBe(File);
    });
});
