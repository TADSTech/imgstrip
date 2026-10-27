/// Strip metadata blocks from FLAC files.
/// Keep STREAMINFO (type 0) and SEEKTABLE (type 3). Remove everything else:
/// PADDING (1), APPLICATION (2), VORBIS_COMMENT (4), CUESHEET (5), PICTURE (6), and unknown types.

const FLAC_MAGIC: &[u8; 4] = b"fLaC";

// Block types to keep
const STREAMINFO: u8 = 0;
const SEEKTABLE: u8 = 3;

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 8 {
        return None;
    }
    if &input[0..4] != FLAC_MAGIC {
        return None;
    }

    // First pass: collect block descriptors
    struct Block {
        block_type: u8,
        offset: usize,    // offset of block data (after the 4-byte block header)
        length: usize,
    }

    let mut blocks = Vec::new();
    let mut pos = 4usize;
    loop {
        if pos + 4 > input.len() {
            return None; // truncated
        }
        let header_byte = input[pos];
        let is_last = (header_byte & 0x80) != 0;
        let block_type = header_byte & 0x7F;
        let length = ((input[pos + 1] as usize) << 16)
            | ((input[pos + 2] as usize) << 8)
            | (input[pos + 3] as usize);

        if pos + 4 + length > input.len() {
            return None; // truncated block
        }

        blocks.push(Block {
            block_type,
            offset: pos + 4,
            length,
        });

        pos = pos + 4 + length;
        if is_last {
            break;
        }
    }

    let audio_data_start = pos;

    // Determine which blocks to keep
    let kept: Vec<&Block> = blocks
        .iter()
        .filter(|b| b.block_type == STREAMINFO || b.block_type == SEEKTABLE)
        .collect();

    // If nothing was removed, return None
    if kept.len() == blocks.len() {
        return None;
    }

    // Build output
    let mut output = Vec::with_capacity(input.len());
    output.extend_from_slice(FLAC_MAGIC);

    for (i, block) in kept.iter().enumerate() {
        let is_last = i == kept.len() - 1;
        let header_byte = if is_last {
            block.block_type | 0x80
        } else {
            block.block_type
        };
        output.push(header_byte);
        output.push((block.length >> 16) as u8);
        output.push((block.length >> 8) as u8);
        output.push(block.length as u8);
        output.extend_from_slice(&input[block.offset..block.offset + block.length]);
    }

    // Append audio frames
    output.extend_from_slice(&input[audio_data_start..]);

    Some(output)
}
