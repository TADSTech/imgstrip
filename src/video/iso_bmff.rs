const CONTAINER_BOXES: &[&[u8; 4]] = &[
    b"moov", b"trak", b"mdia", b"minf", b"dinf", b"stbl",
    b"edts", b"meco", b"mere",
];

const METADATA_BOXES: &[&[u8; 4]] = &[
    b"udta", b"meta", b"XMP_", b"CPXM", b"uuid",
];

struct BoxHeader {
    header_size: usize,
    actual_size: usize,
    box_type: [u8; 4],
}

fn read_box_header(data: &[u8], pos: usize) -> Option<BoxHeader> {
    let remaining = data.len().checked_sub(pos)?;
    if remaining < 8 {
        return None;
    }
    let size = u32::from_be_bytes([
        data[pos], data[pos + 1], data[pos + 2], data[pos + 3],
    ]);
    let box_type: [u8; 4] = [
        data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7],
    ];
    let (header_size, actual_size) = if size == 1 {
        if remaining < 16 {
            return None;
        }
        let large_size = u64::from_be_bytes([
            data[pos + 8], data[pos + 9], data[pos + 10], data[pos + 11],
            data[pos + 12], data[pos + 13], data[pos + 14], data[pos + 15],
        ]);
        (16, large_size as usize)
    } else if size == 0 {
        (8, remaining)
    } else if size >= 8 {
        (8, size as usize)
    } else {
        return None;
    };
    if actual_size < header_size || pos + actual_size > data.len() {
        return None;
    }
    Some(BoxHeader { header_size, actual_size, box_type })
}

fn is_metadata_box(box_type: &[u8; 4]) -> bool {
    METADATA_BOXES.iter().any(|t| *t == box_type)
}

fn is_container_box(box_type: &[u8; 4]) -> bool {
    CONTAINER_BOXES.iter().any(|t| *t == box_type)
}

fn write_box_header(out: &mut Vec<u8>, box_type: &[u8; 4], data_len: usize, orig_header_size: usize) {
    let total = orig_header_size + data_len;
    if orig_header_size == 8 {
        out.extend_from_slice(&(total as u32).to_be_bytes());
        out.extend_from_slice(box_type);
    } else {
        out.extend_from_slice(&1u32.to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend_from_slice(&(total as u64).to_be_bytes());
    }
}

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 8 {
        return None;
    }
    let mut output = Vec::with_capacity(input.len());
    let mut pos = 0;
    while pos < input.len() {
        let header = match read_box_header(input, pos) {
            Some(h) => h,
            None => {
                output.extend_from_slice(&input[pos..]);
                break;
            }
        };
        if is_metadata_box(&header.box_type) {
            pos += header.actual_size;
            continue;
        }
        if is_container_box(&header.box_type) {
            let inner = &input[pos + header.header_size..pos + header.actual_size];
            if let Some(filtered) = filter_boxes(inner) {
                write_box_header(
                    &mut output,
                    &header.box_type,
                    filtered.len(),
                    header.header_size,
                );
                output.extend_from_slice(&filtered);
            } else {
                output.extend_from_slice(&input[pos..pos + header.actual_size]);
            }
        } else {
            output.extend_from_slice(&input[pos..pos + header.actual_size]);
        }
        pos += header.actual_size;
    }
    Some(output)
}

fn filter_boxes(data: &[u8]) -> Option<Vec<u8>> {
    let mut output = Vec::with_capacity(data.len());
    let mut pos = 0;
    let mut any_removed = false;
    while pos < data.len() {
        let header = match read_box_header(data, pos) {
            Some(h) => h,
            None => {
                output.extend_from_slice(&data[pos..]);
                break;
            }
        };
        if is_metadata_box(&header.box_type) {
            any_removed = true;
            pos += header.actual_size;
            continue;
        }
        if is_container_box(&header.box_type) {
            let inner = &data[pos + header.header_size..pos + header.actual_size];
            if let Some(filtered) = filter_boxes(inner) {
                write_box_header(
                    &mut output,
                    &header.box_type,
                    filtered.len(),
                    header.header_size,
                );
                output.extend_from_slice(&filtered);
                if filtered.len() != header.actual_size - header.header_size {
                    any_removed = true;
                }
            } else {
                output.extend_from_slice(&data[pos..pos + header.actual_size]);
            }
        } else {
            output.extend_from_slice(&data[pos..pos + header.actual_size]);
        }
        pos += header.actual_size;
    }
    if any_removed { Some(output) } else { None }
}
