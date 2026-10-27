/// Strip metadata chunks from WAV (RIFF) files.
/// Keep essential chunks: fmt, data, fact, cue, smpl, bext.
/// Remove LIST/INFO, JUNK, id3, and other non-essential chunks.

const METADATA_LIST_TYPES: &[&[u8; 4]] = &[b"INFO", b"adtl"];

const METADATA_CHUNK_IDS: &[&[u8; 4]] = &[b"JUNK", b"id3 ", b"ID3 ", b"PAD "];

fn is_list(chunk_id: &[u8; 4]) -> bool {
    chunk_id == b"LIST" || chunk_id == b"list"
}

fn is_metadata_list_type(form_type: &[u8; 4]) -> bool {
    METADATA_LIST_TYPES.iter().any(|t| *t == form_type)
}

fn is_metadata_chunk_id(id: &[u8; 4]) -> bool {
    METADATA_CHUNK_IDS.iter().any(|t| *t == id)
}

fn pad_to_two(v: usize) -> usize {
    v + (v & 1)
}

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 12 {
        return None;
    }
    if &input[0..4] != b"RIFF" {
        return None;
    }
    // bytes 8..12 should be "WAVE"
    if &input[8..12] != b"WAVE" {
        return None;
    }

    let mut output = Vec::with_capacity(input.len());
    // Write RIFF header (will fix the size at the end)
    output.extend_from_slice(&input[0..12]);

    let mut pos = 12usize;
    let mut any_removed = false;

    while pos < input.len() {
        if pos + 8 > input.len() {
            output.extend_from_slice(&input[pos..]);
            break;
        }
        let chunk_id: [u8; 4] = [
            input[pos], input[pos + 1], input[pos + 2], input[pos + 3],
        ];
        let chunk_size = u32::from_le_bytes([
            input[pos + 4], input[pos + 5], input[pos + 6], input[pos + 7],
        ]) as usize;
        let padded = pad_to_two(chunk_size);
        let chunk_end = pos + 8 + padded;
        if chunk_end > input.len() {
            // Truncated chunk — include remainder as-is
            output.extend_from_slice(&input[pos..]);
            break;
        }

        // Check for LIST chunks with metadata sub-types
        if is_list(&chunk_id) && chunk_size >= 4 {
            let list_type: [u8; 4] = [
                input[pos + 8],
                input[pos + 9],
                input[pos + 10],
                input[pos + 11],
            ];
            if is_metadata_list_type(&list_type) {
                any_removed = true;
                pos = chunk_end;
                continue;
            }
        }

        // Check for standalone metadata chunk IDs
        if is_metadata_chunk_id(&chunk_id) {
            any_removed = true;
            pos = chunk_end;
            continue;
        }

        // Keep this chunk
        output.extend_from_slice(&input[pos..chunk_end]);
        pos = chunk_end;
    }

    if !any_removed {
        return None;
    }

    // Fix the RIFF size field (bytes 4..8): total file size minus 8
    let riff_size = (output.len() - 8) as u32;
    output[4] = (riff_size & 0xFF) as u8;
    output[5] = ((riff_size >> 8) & 0xFF) as u8;
    output[6] = ((riff_size >> 16) & 0xFF) as u8;
    output[7] = ((riff_size >> 24) & 0xFF) as u8;

    Some(output)
}
