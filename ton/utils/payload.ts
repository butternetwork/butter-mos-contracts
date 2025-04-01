import { Cell, beginCell, Builder } from '@ton/core';

export class PayloadCodec {
    // Use 1020 bits (127.5 bytes, exactly 255 hex chars)
    private readonly MAX_BITS = 1016;
    private readonly MAX_HEX_CHARS = 1016 / 4;

    /**
     * Convert hex string to binary string
     */
    private hexToBinary(hex: string): string {
        return hex
            .split('')
            .map((char) => parseInt(char, 16).toString(2).padStart(4, '0'))
            .join('');
    }

    /**
     * Convert binary string to hex string
     */
    private binaryToHex(binary: string): string {
        const chunks = binary.match(/.{1,4}/g) || [];
        return chunks.map((chunk) => parseInt(chunk, 2).toString(16)).join('');
    }

    /**
     * Encode hex data into a Chain of Cells
     * @param hexData hex string starting with 0x
     */
    public encode(hexData: string): Cell {
        if (!hexData.startsWith('0x')) {
            throw new Error('Hex data must start with 0x');
        }
        const cleanHex = hexData.slice(2);
        const binaryStr = this.hexToBinary(cleanHex);

        // First, create all needed cells
        const cells: Builder[] = [];
        let position = 0;

        // Allocate data to each cell
        while (position < binaryStr.length) {
            const cell = beginCell();
            const bitsForCurrentCell = binaryStr.slice(position, position + this.MAX_BITS);

            // Store data for current cell
            for (let bit of bitsForCurrentCell) {
                cell.storeBit(parseInt(bit));
            }

            cells.push(cell);
            position += this.MAX_BITS;
        }

        let lastCell = cells[cells.length - 1].endCell();
        // Go backwards and build the chain
        for (let i = cells.length - 2; i >= 0; i--) {
            cells[i].storeRef(lastCell);
            lastCell = cells[i].endCell();
        }

        // Return the first cell (root node)
        return lastCell;
    }

    /**
     * Decode data from Chain of Cells back to hex format
     * @param rootCell root Cell of the chain
     * @returns hex string starting with 0x
     */
    public decode(rootCell: Cell): string {
        let binaryResult = '';
        let currentCell = rootCell;
        let cellCount = 0;

        do {
            cellCount++;
            // Create a new slice for current cell
            const slice = currentCell.beginParse();
            // Read all bits from current slice
            const cellBits = [];
            while (slice.remainingBits > 0) {
                cellBits.push(slice.loadBit() ? '1' : '0');
            }
            binaryResult += cellBits.join('');

            // Check if we have a next cell
            if (slice.remainingRefs === 0) {
                break;
            }

            try {
                const nextCell = slice.loadRef();
                currentCell = nextCell;
            } catch (e) {
                console.error('Error loading next cell:', e);
                break;
            }
        } while (true);

        return '0x' + this.binaryToHex(binaryResult);
    }

    /**
     * Calculate how many Cells needed for given hex data
     * @param hexData hex string starting with 0x
     * @returns number of Cells needed
     */
    public static calculateCellCount(hexData: string): number {
        // Remove 0x prefix
        const cleanHex = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
        // Each Cell stores 255 hex chars (1020 bits)
        return Math.ceil(cleanHex.length / 254);
    }
}
