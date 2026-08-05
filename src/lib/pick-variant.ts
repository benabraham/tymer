// Picks a variant index, avoiding an immediate repeat of `lastIndex` when
// there's more than one variant to choose from.
export const pickVariant = (variants: unknown[], lastIndex: number | undefined): number => {
    if (variants.length <= 1) return 0

    let index = Math.floor(Math.random() * variants.length)
    if (index === lastIndex) {
        index = (index + 1) % variants.length
    }
    return index
}
