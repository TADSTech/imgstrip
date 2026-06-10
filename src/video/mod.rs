pub mod iso_bmff;
pub mod ebml;
pub mod riff;

pub fn strip_metadata(input: &[u8], ext: &str) -> Option<Vec<u8>> {
    let ext_lower = ext.to_lowercase();
    match ext_lower.as_str() {
        "mp4" | "mov" | "m4v" | "3gp" => iso_bmff::strip_metadata(input),
        "webm" | "mkv" => ebml::strip_metadata(input),
        "avi" => riff::strip_metadata(input),
        _ => None,
    }
}
