pub mod mp3;
pub mod flac;
pub mod ogg;
pub mod wav;
pub mod m4a;

pub fn strip_metadata(input: &[u8], ext: &str) -> Option<Vec<u8>> {
    let ext_lower = ext.to_lowercase();
    match ext_lower.as_str() {
        "mp3" => mp3::strip_metadata(input),
        "flac" => flac::strip_metadata(input),
        "ogg" | "oga" | "opus" => ogg::strip_metadata(input),
        "wav" | "wave" => wav::strip_metadata(input),
        "m4a" | "aac" | "m4b" | "m4p" => m4a::strip_metadata(input),
        _ => None,
    }
}
