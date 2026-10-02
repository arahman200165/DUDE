
export function DependencyVersionComparator_kindLabel(kind: string): string {
    switch (kind) {
        case 'added':
            return 'Added';
        case 'removed':
            return 'Removed';
        case 'unchanged':
            return 'Unchanged';
        case 'upgraded-major':
            return 'Major upgrade';
        case 'upgraded-minor':
            return 'Minor upgrade';
        case 'upgraded-patch':
            return 'Patch upgrade';
        case 'downgraded':
            return 'Downgraded';
        default:
            return 'Changed';
    }
}
