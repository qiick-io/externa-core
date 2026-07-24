<?php

namespace App\GraphQL\Scalars;

use GraphQL\Error\Error;
use GraphQL\Language\AST\BooleanValueNode;
use GraphQL\Language\AST\FloatValueNode;
use GraphQL\Language\AST\IntValueNode;
use GraphQL\Language\AST\ListValueNode;
use GraphQL\Language\AST\Node;
use GraphQL\Language\AST\NullValueNode;
use GraphQL\Language\AST\ObjectValueNode;
use GraphQL\Language\AST\StringValueNode;
use GraphQL\Type\Definition\ScalarType;

/**
 * Arbitrary JSON scalar for filter/data payloads.
 */
final class JSON extends ScalarType
{
    public string $name = 'JSON';

    public ?string $description = 'Arbitrary JSON value';

    public function serialize(mixed $value): mixed
    {
        return $value;
    }

    public function parseValue(mixed $value): mixed
    {
        return $value;
    }

    public function parseLiteral(Node $valueNode, ?array $variables = null): mixed
    {
        if ($valueNode instanceof NullValueNode) {
            return null;
        }
        if ($valueNode instanceof StringValueNode || $valueNode instanceof BooleanValueNode) {
            return $valueNode->value;
        }
        if ($valueNode instanceof IntValueNode) {
            return (int) $valueNode->value;
        }
        if ($valueNode instanceof FloatValueNode) {
            return (float) $valueNode->value;
        }
        if ($valueNode instanceof ListValueNode) {
            $out = [];
            foreach ($valueNode->values as $value) {
                $out[] = $this->parseLiteral($value, $variables);
            }

            return $out;
        }
        if ($valueNode instanceof ObjectValueNode) {
            $out = [];
            foreach ($valueNode->fields as $field) {
                $out[$field->name->value] = $this->parseLiteral($field->value, $variables);
            }

            return $out;
        }

        throw new Error('Cannot represent literal as JSON.');
    }
}
