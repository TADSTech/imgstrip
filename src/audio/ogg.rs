/// Strip Vorbis/Opus comments from OGG container files.
///
/// OGG files are composed of pages (each starting with "OggS"). Audio data is carried in
/// logical bitstreams. For Vorbis, the second packet is the comment header (type byte 0x03
/// + "vorbis"). For Opus, it's the "OpusTags" packet. We replace the comment packet with a
/// minimal empty one, keeping the OGG page structure valid.

/// Read a 32-bit little-endian u32 from `data` at `pos`.
fn read_u32_le(data: &[u8], pos: usize) -> Option<u32> {
    if pos + 4 > data.len() {
        return None;
    }
    Some(u32::from_le_bytes([
        data[pos],
        data[pos + 1],
        data[pos + 2],
        data[pos + 3],
    ]))
}

/// Read a 64-bit little-endian u64 from `data` at `pos`.
fn read_u64_le(data: &[u8], pos: usize) -> Option<u64> {
    if pos + 8 > data.len() {
        return None;
    }
    Some(u64::from_le_bytes([
        data[pos],
        data[pos + 1],
        data[pos + 2],
        data[pos + 3],
        data[pos + 4],
        data[pos + 5],
        data[pos + 6],
        data[pos + 7],
    ]))
}

/// Compute CRC-32 for OGG pages (polynomial 0x04C11DB7, direct / big-endian style).
fn crc32_ogg(data: &[u8]) -> u32 {
    // Build the lookup table at call time (256 entries, negligible cost).
    let table: [u32; 256] = {
        let mut t = [0u32; 256];
        let mut i = 0u32;
        while i < 256 {
            let mut r = i << 24;
            let mut j = 0;
            while j < 8 {
                if r & 0x80000000 != 0 {
                    r = (r << 1) ^ 0x04C11DB7;
                } else {
                    r <<= 1;
                }
                j += 1;
            }
            t[i as usize] = r;
            i += 1;
        }
        t
    };

    let mut crc = 0u32;
    for &b in data {
        crc = (crc << 8) ^ table[((crc >> 24) ^ b as u32) as usize];
    }
    crc
}

/// An OGG page parsed from the input.
struct OggPage {
    /// Byte offset where this page starts in the input.
    start: usize,
    /// Total byte length of this page (header + segment table + payload).
    total_len: usize,
    /// The segment table entries (each is 1 byte, gives segment length).
    segment_table: Vec<u8>,
    /// Payload bytes (concatenation of all segments).
    payload: Vec<u8>,
    /// Header type flags (byte 5).
    header_type: u8,
    /// Granule position (bytes 6..14).
    granule: u64,
    /// Serial number (bytes 14..18).
    serial: u32,
    /// Page sequence number (bytes 18..22).
    page_seq: u32,
}

/// Parse a single OGG page starting at `pos`.
fn parse_page(data: &[u8], pos: usize) -> Option<OggPage> {
    if pos + 27 > data.len() {
        return None;
    }
    // Check capture pattern
    if &data[pos..pos + 4] != b"OggS" {
        return None;
    }
    // Stream structure version
    if data[pos + 4] != 0 {
        return None;
    }
    let header_type = data[pos + 5];
    let granule = read_u64_le(data, pos + 6)?;
    let serial = read_u32_le(data, pos + 14)?;
    let page_seq = read_u32_le(data, pos + 18)?;
    // CRC at bytes 22..26 (we'll recompute)
    let num_segments = data[pos + 26] as usize;
    let header_len = 27 + num_segments;
    if pos + header_len > data.len() {
        return None;
    }
    let segment_table: Vec<u8> = data[pos + 27..pos + header_len].to_vec();
    let payload_len: usize = segment_table.iter().map(|&s| s as usize).sum();
    let total_len = header_len + payload_len;
    if pos + total_len > data.len() {
        return None;
    }
    let payload = data[pos + header_len..pos + total_len].to_vec();
    Some(OggPage {
        start: pos,
        total_len,
        segment_table,
        payload,
        header_type,
        granule,
        serial,
        page_seq,
    })
}

/// Build a raw OGG page from a page struct with (potentially modified) payload.
fn build_page(page: &OggPage, new_payload: &[u8]) -> Vec<u8> {
    // Build segment table for the new payload
    let mut seg_table = Vec::new();
    let mut remaining = new_payload.len();
    while remaining >= 255 {
        seg_table.push(255u8);
        remaining -= 255;
    }
    seg_table.push(remaining as u8);

    let header_len = 27 + seg_table.len();
    let mut out = Vec::with_capacity(header_len + new_payload.len());

    // Capture pattern
    out.extend_from_slice(b"OggS");
    // Version
    out.push(0);
    // Header type
    out.push(page.header_type);
    // Granule position
    out.extend_from_slice(&page.granule.to_le_bytes());
    // Serial
    out.extend_from_slice(&page.serial.to_le_bytes());
    // Page sequence number
    out.extend_from_slice(&page.page_seq.to_le_bytes());
    // CRC placeholder (4 bytes of zero, computed after)
    out.extend_from_slice(&[0u8; 4]);
    // Number of segments
    out.push(seg_table.len() as u8);
    // Segment table
    out.extend_from_slice(&seg_table);
    // Payload
    out.extend_from_slice(new_payload);

    // Compute CRC over entire page with CRC field = 0
    let crc = crc32_ogg(&out);
    out[22] = (crc & 0xFF) as u8;
    out[23] = ((crc >> 8) & 0xFF) as u8;
    out[24] = ((crc >> 16) & 0xFF) as u8;
    out[25] = ((crc >> 24) & 0xFF) as u8;

    out
}

/// Build a minimal Vorbis comment packet: type byte 0x03 + "vorbis" + vendor length 0 +
/// empty vendor string + user comment list count 0.
fn empty_vorbis_comment() -> Vec<u8> {
    let mut pkt = Vec::new();
    pkt.push(0x03); // packet type
    pkt.extend_from_slice(b"vorbis");
    pkt.extend_from_slice(&0u32.to_le_bytes()); // vendor string length
    pkt.extend_from_slice(&0u32.to_le_bytes()); // user comment list length
    // framing bit
    pkt.push(1);
    pkt
}

/// Build a minimal OpusTags packet: "OpusTags" + vendor length 0 + comment count 0.
fn empty_opus_tags() -> Vec<u8> {
    let mut pkt = Vec::new();
    pkt.extend_from_slice(b"OpusTags");
    pkt.extend_from_slice(&0u32.to_le_bytes()); // vendor string length
    pkt.extend_from_slice(&0u32.to_le_bytes()); // user comment list length
    pkt
}

/// Extract complete packets from consecutive pages. A packet ends when a segment entry
/// is < 255. Pages with the "continued" flag have their first segment appended to the
/// previous partial packet.
///
/// Returns (packets, pages_consumed). Each packet is a `Vec<u8>`.
fn extract_packets(pages: &[OggPage], max_packets: usize) -> (Vec<Vec<u8>>, usize) {
    let mut packets: Vec<Vec<u8>> = Vec::new();
    let mut current: Vec<u8> = Vec::new();
    let mut pages_consumed = 0;

    for page in pages {
        pages_consumed += 1;
        let mut seg_offset = 0usize;
        for &seg_len in &page.segment_table {
            let end = seg_offset + seg_len as usize;
            if end > page.payload.len() {
                break;
            }
            current.extend_from_slice(&page.payload[seg_offset..end]);
            seg_offset = end;
            if seg_len < 255 {
                // Packet complete
                packets.push(std::mem::take(&mut current));
                if packets.len() >= max_packets {
                    return (packets, pages_consumed);
                }
            }
        }
        // If we've collected enough packets, stop consuming pages
        if packets.len() >= max_packets {
            break;
        }
    }
    (packets, pages_consumed)
}

pub fn strip_metadata(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() < 4 || &input[0..4] != b"OggS" {
        return None;
    }

    // Parse all pages
    let mut pages: Vec<OggPage> = Vec::new();
    let mut pos = 0usize;
    while pos < input.len() {
        match parse_page(input, pos) {
            Some(page) => {
                pos += page.total_len;
                pages.push(page);
            }
            None => break,
        }
    }

    if pages.len() < 2 {
        return None;
    }

    // We need at least 2 packets from the stream (identification header + comment header).
    // Collect pages for the first serial (main audio stream).
    let main_serial = pages[0].serial;
    let stream_pages: Vec<&OggPage> = pages.iter().filter(|p| p.serial == main_serial).collect();

    if stream_pages.len() < 2 {
        return None;
    }

    // Extract 2 packets to examine packet 2 (the comment header)
    let owned_stream_pages: Vec<OggPage> = stream_pages
        .iter()
        .map(|p| OggPage {
            start: p.start,
            total_len: p.total_len,
            segment_table: p.segment_table.clone(),
            payload: p.payload.clone(),
            header_type: p.header_type,
            granule: p.granule,
            serial: p.serial,
            page_seq: p.page_seq,
        })
        .collect();
    let (packets, _) = extract_packets(&owned_stream_pages, 2);

    if packets.len() < 2 {
        return None;
    }

    let comment_pkt = &packets[1];
    let is_vorbis = comment_pkt.len() >= 7 && comment_pkt[0] == 0x03 && &comment_pkt[1..7] == b"vorbis";
    let is_opus = comment_pkt.len() >= 8 && &comment_pkt[0..8] == b"OpusTags";

    if !is_vorbis && !is_opus {
        return None;
    }

    let empty_comment = if is_vorbis {
        empty_vorbis_comment()
    } else {
        empty_opus_tags()
    };

    // If the comment is already minimal, nothing to strip
    if comment_pkt == &empty_comment {
        return None;
    }

    // Strategy: The comment packet typically lives entirely within the second page.
    // We'll rebuild the file: copy page 0 as-is, rebuild the comment page(s) with
    // the minimal comment packet, then copy all remaining pages unchanged.
    //
    // For simplicity and correctness, find which pages carry the comment packet.
    // The first page (page_seq=0) carries the identification header.
    // The comment header starts in the next page(s).

    // Find the index in `pages` of the first page after the identification header
    // for the main serial.
    let mut id_page_idx = None;
    let mut comment_page_indices: Vec<usize> = Vec::new();
    let mut pkt_count = 0usize;
    let mut in_partial = false;

    for (idx, page) in pages.iter().enumerate() {
        if page.serial != main_serial {
            continue;
        }
        if id_page_idx.is_none() {
            // First page of main serial = identification header page
            id_page_idx = Some(idx);
            // Count how many packets end in this page
            for &seg in &page.segment_table {
                if in_partial {
                    if seg < 255 {
                        pkt_count += 1;
                        in_partial = false;
                    }
                } else if seg < 255 {
                    pkt_count += 1;
                } else {
                    in_partial = true;
                }
            }
            continue;
        }
        // Subsequent pages: accumulate until we've completed the second packet
        comment_page_indices.push(idx);
        for &seg in &page.segment_table {
            if in_partial {
                if seg < 255 {
                    pkt_count += 1;
                    in_partial = false;
                }
            } else if seg < 255 {
                pkt_count += 1;
            } else {
                in_partial = true;
            }
        }
        if pkt_count >= 2 {
            break;
        }
    }

    if comment_page_indices.is_empty() {
        return None;
    }

    // Build the output
    let mut output = Vec::with_capacity(input.len());

    // Determine the set of page indices that carry the comment packet
    let comment_set: std::collections::HashSet<usize> =
        comment_page_indices.iter().cloned().collect();

    let mut replaced = false;

    for (idx, page) in pages.iter().enumerate() {
        if comment_set.contains(&idx) {
            if !replaced {
                // Emit the replacement comment page (only for the first comment page)
                let replacement_page = build_page(page, &empty_comment);
                output.extend_from_slice(&replacement_page);
                replaced = true;
            }
            // Skip the rest of the comment pages (the replacement fits in one page)
        } else {
            // Copy original page verbatim
            output.extend_from_slice(&input[page.start..page.start + page.total_len]);
        }
    }

    // Append any trailing data after the last parsed page
    let last_page_end = pages.last().map(|p| p.start + p.total_len).unwrap_or(0);
    if last_page_end < input.len() {
        output.extend_from_slice(&input[last_page_end..]);
    }

    Some(output)
}
