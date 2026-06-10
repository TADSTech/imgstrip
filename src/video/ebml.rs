use std::io::Read;

fn read_vint<R: Read>(reader: &mut R) -> Option<(u64, usize)> {
    let mut first = [0u8; 1];
    reader.read_exact(&mut first).ok()?;
    let first_byte = first[0];
    let mut length = 0usize;
    let mut mask = 0x80u8;

    if first_byte == 0 {
        return None;
    }
    while (first_byte & mask) == 0 {
        length += 1;
        mask >>= 1;
    }
    length += 1;

    let value_mask = mask - 1;
    let mut value = (first_byte & value_mask) as u64;
    for _ in 1..length {
        let mut byte = [0u8; 1];
        reader.read_exact(&mut byte).ok()?;
        value = (value << 8) | byte[0] as u64;
    }
    Some((value, length))
}

fn is_metadata_elem(id: u64) -> bool {
    matches!(id, 0x1254C367 | 0x1941A469)
}

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 4 {
        return None;
    }
    let mut in_pos = 0usize;
    let mut output = Vec::with_capacity(input.len());
    let mut reader = std::io::Cursor::new(input);
    let mut any_removed = false;

    while in_pos < input.len() {
        let (elem_id, id_len) = match read_vint(&mut reader) {
            Some(v) => v,
            None => {
                output.extend_from_slice(&input[in_pos..]);
                break;
            }
        };
        in_pos += id_len;
        let (elem_size, size_len) = match read_vint(&mut reader) {
            Some(v) => v,
            None => {
                output.extend_from_slice(&input[in_pos - id_len..]);
                break;
            }
        };
        in_pos += size_len;
        let total_elem_len = elem_size as usize;
        if in_pos + total_elem_len > input.len() {
            output.extend_from_slice(&input[in_pos - id_len - size_len..]);
            break;
        }
        if is_metadata_elem(elem_id) {
            any_removed = true;
            in_pos += total_elem_len;
            reader = std::io::Cursor::new(&input[in_pos..]);
            continue;
        }
        let start = in_pos - id_len - size_len;
        let end = start + id_len + size_len + total_elem_len;
        let slice = &input[start..end];
        output.extend_from_slice(slice);
        in_pos += total_elem_len;
    }
    if any_removed { Some(output) } else { None }
}
