/// Strip ID3v2 (front), APEv2 (before ID3v1), and ID3v1 (last 128 bytes) tags from MP3 data.

/// Read an ID3v2 tag size from the 10-byte header starting at `pos`.
/// The header is: "ID3" (3 bytes) + version (2 bytes) + flags (1 byte) + syncsafe size (4 bytes).
/// Returns the total tag size including the header.
fn id3v2_total_size(data: &[u8], pos: usize) -> Option<usize> {
    if pos + 10 > data.len() {
        return None;
    }
    if &data[pos..pos + 3] != b"ID3" {
        return None;
    }
    // Synchsafe integer: 4 bytes, each using only 7 bits
    let b = &data[pos + 6..pos + 10];
    if b[0] & 0x80 != 0 || b[1] & 0x80 != 0 || b[2] & 0x80 != 0 || b[3] & 0x80 != 0 {
        return None;
    }
    let size = ((b[0] as u32) << 21)
        | ((b[1] as u32) << 14)
        | ((b[2] as u32) << 7)
        | (b[3] as u32);
    let flags = data[pos + 5];
    // Bit 4 of flags = footer present (adds 10 bytes)
    let footer_size = if flags & 0x10 != 0 { 10 } else { 0 };
    Some(10 + size as usize + footer_size)
}

/// Detect an APEv2 tag footer at the given position (the footer is 32 bytes ending at `end`).
/// The footer starts with "APETAGEX" and contains the total tag size (including the 32-byte
/// header but not the footer itself, unless flags say otherwise).
/// Returns (tag_start, tag_end) relative to the input.
fn find_apev2_tag(data: &[u8], end: usize) -> Option<(usize, usize)> {
    if end < 32 {
        return None;
    }
    let footer_start = end - 32;
    if &data[footer_start..footer_start + 8] != b"APETAGEX" {
        return None;
    }
    // APE tag size at footer offset +12 (4 bytes LE) — this size includes the 32-byte header
    // but NOT the footer in APEv2 unless the "tag contains a header" flag is set, but
    // conventionally the size field is the size of the items + footer (32 bytes). The total
    // on-disk footprint also includes a 32-byte header if the header-present flag is set.
    let tag_size = u32::from_le_bytes([
        data[footer_start + 12],
        data[footer_start + 13],
        data[footer_start + 14],
        data[footer_start + 15],
    ]) as usize;

    let flags = u32::from_le_bytes([
        data[footer_start + 20],
        data[footer_start + 21],
        data[footer_start + 22],
        data[footer_start + 23],
    ]);
    let has_header = (flags & (1 << 31)) != 0;
    let header_size = if has_header { 32 } else { 0 };

    // tag_size includes the footer (32 bytes) in APEv2
    let total = tag_size + header_size;
    if total > end {
        return None;
    }
    let tag_start = end - total;

    // Validate: if there's a header, it should also start with "APETAGEX"
    if has_header && &data[tag_start..tag_start + 8] != b"APETAGEX" {
        return None;
    }

    Some((tag_start, end))
}

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 4 {
        return None;
    }

    let mut any_removed = false;

    // --- Strip ID3v2 tags at the start (there can be multiple) ---
    let mut audio_start = 0usize;
    loop {
        match id3v2_total_size(input, audio_start) {
            Some(tag_size) => {
                let new_start = audio_start + tag_size;
                if new_start > input.len() {
                    break;
                }
                audio_start = new_start;
                any_removed = true;
            }
            None => break,
        }
    }

    // --- Determine audio end by stripping ID3v1 and APEv2 at the tail ---
    let mut audio_end = input.len();

    // Check for ID3v1 (last 128 bytes start with "TAG")
    if audio_end >= 128 && &input[audio_end - 128..audio_end - 125] == b"TAG" {
        audio_end -= 128;
        any_removed = true;
    }

    // Check for APEv2 tag sitting before the (now-removed) ID3v1 position
    if let Some((tag_start, _tag_end)) = find_apev2_tag(input, audio_end) {
        audio_end = tag_start;
        any_removed = true;
    }

    if !any_removed {
        return None;
    }

    if audio_start >= audio_end {
        return None;
    }

    Some(input[audio_start..audio_end].to_vec())
}
