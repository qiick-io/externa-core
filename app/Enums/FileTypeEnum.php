<?php

namespace App\Enums;

/**
 * File manager node kinds (file, folder, link, etc.).
 */
enum FileTypeEnum: string
{
    case File = 'file';
    case Folder = 'folder';
    case Link = 'link';
    case External = 'external';
    case Generated = 'generated';
    case Collection = 'collection';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
