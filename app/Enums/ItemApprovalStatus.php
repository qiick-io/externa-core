<?php

namespace App\Enums;

/**
 * Editorial approval workflow status for versioned collection items.
 */
enum ItemApprovalStatus: string
{
    case Draft = 'draft';
    case InReview = 'in_review';
    case Approved = 'approved';
    case Rejected = 'rejected';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
