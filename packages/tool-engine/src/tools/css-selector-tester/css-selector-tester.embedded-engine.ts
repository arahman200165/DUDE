
export function CssSelectorTester_formatElement(el: {
    tag: string;
    id: string | null;
    classes: readonly string[];
}): string {
    const id = el.id ? `#${el.id}` : '';
    const classes = el.classes.length ? `.${el.classes.join('.')}` : '';
    return `${el.tag}${id}${classes}`;
}
