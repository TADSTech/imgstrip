use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::{Backend, CrosstermBackend},
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Terminal,
};
use std::{
    error::Error,
    fs,
    io,
    path::Path,
};

mod video;

use img_parts::{jpeg::Jpeg, png::Png, ImageEXIF};
use bytes::Bytes;
use image;

enum InputMode {
    Normal,
    Editing,
}

struct App {
    input: String,
    input_mode: InputMode,
    messages: Vec<String>,
    scanned_files: usize,
    stripped_files: usize,
}

impl App {
    fn new() -> App {
        App {
            input: String::new(),
            input_mode: InputMode::Normal,
            messages: vec!["Welcome to ImgStrip! Press 'e' to enter directory path, 'Enter' to process, 'q' to quit.".to_string()],
            scanned_files: 0,
            stripped_files: 0,
        }
    }
}

fn process_directory(path: &Path, app: &mut App) -> Result<(), Box<dyn Error>> {
    if !path.exists() || !path.is_dir() {
        app.messages.push(format!("Error: Directory '{}' does not exist.", path.display()));
        return Ok(());
    }

    app.messages.push(format!("Scanning directory: {}", path.display()));
    
    let entries = fs::read_dir(path)?;
    for entry in entries {
        let entry = entry?;
        let file_path = entry.path();
        
        if file_path.is_file() {
            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                let supported_exts = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif", "ico", "tga", "qoi", "avif", "mp4", "mov", "m4v", "3gp", "webm", "mkv", "avi"];
                if supported_exts.contains(&ext_lower.as_str()) {
                    app.scanned_files += 1;
                    match strip_metadata(&file_path) {
                        Ok(true) => {
                            app.messages.push(format!("Stripped: {}", file_path.display()));
                            app.stripped_files += 1;
                        }
                        Ok(false) => {
                            app.messages.push(format!("No metadata or skip: {}", file_path.display()));
                        }
                        Err(e) => {
                            app.messages.push(format!("Error on {}: {}", file_path.display(), e));
                        }
                    }
                }
            }
        }
    }

    app.messages.push(format!("Done. Scanned: {}, Stripped: {}", app.scanned_files, app.stripped_files));
    app.scanned_files = 0;
    app.stripped_files = 0;
    Ok(())
}

fn strip_metadata(path: &Path) -> Result<bool, Box<dyn Error>> {
    let input = fs::read(path)?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let video_exts = ["mp4", "mov", "m4v", "3gp", "webm", "mkv", "avi"];
    if video_exts.contains(&ext.as_str()) {
        if let Some(stripped) = video::strip_metadata(&input, &ext) {
            fs::write(path, stripped)?;
            return Ok(true);
        }
        return Ok(false);
    }

    let mut modified = false;

    if ext == "jpg" || ext == "jpeg" {
        if let Ok(mut jpeg) = Jpeg::from_bytes(Bytes::from(input.clone())) {
            let initial_exif = jpeg.exif().is_some();
            if initial_exif {
                jpeg.set_exif(None);
            }
            
            // For robust EXIF/XMP/C2PA removal we can strip all APP segments
            let initial_len = jpeg.segments().len();
            jpeg.segments_mut().retain(|s| {
                // APP segments are 0xE0 to 0xEF
                let marker = s.marker();
                if marker >= 0xE0 && marker <= 0xEF {
                    // Only keep APP0 (JFIF)
                    if marker == 0xE0 {
                        true
                    } else {
                        false // Strip APP1-APP15 (EXIF, XMP, ICC, JUMBF/C2PA, Photoshop etc.)
                    }
                } else {
                    true
                }
            });
            
            if initial_exif || jpeg.segments().len() != initial_len {
                let mut out = Vec::new();
                jpeg.encoder().write_to(&mut out)?;
                fs::write(path, out)?;
                modified = true;
            }
        }
    } else if ext == "png" {
        if let Ok(mut png) = Png::from_bytes(Bytes::from(input)) {
            let initial_exif = png.exif().is_some();
            if initial_exif {
                png.set_exif(None);
            }

            // Aggressively remove all ancillary chunks EXCEPT critical and transparency/color
            let initial_len = png.chunks().len();
            png.chunks_mut().retain(|chunk| {
                let kind = chunk.kind();
                // 5th bit of the first byte indicates if it's an ancillary chunk (lowercase)
                let is_ancillary = (kind[0] & 0x20) != 0;
                
                if is_ancillary {
                    // Keep essential display chunks: transparency, physics, gamma, background, etc.
                    // DO NOT keep: text chunks (tEXt, zTXt, iTXt, eXIf), C2PA chunks (c2pa, ca2p, cx2p), Adobe chunks
                    matches!(&kind, b"tRNS" | b"cHRM" | b"gAMA" | b"sBIT" | b"sRGB" | b"bKGD" | b"pHYs")
                } else {
                    true // Critical chunks (IHDR, PLTE, IDAT, IEND)
                }
            });

            if initial_exif || png.chunks().len() != initial_len {
                let mut out = Vec::new();
                png.encoder().write_to(&mut out)?;
                fs::write(path, out)?;
                modified = true;
            }
        }
    } else {
        // Fallback for all other global image formats (webp, gif, bmp, tiff, avif, etc.)
        // Reading and re-saving the image through the `image` crate natively drops 
        // metadata chunks, C2PA, and EXIF/XMP without explicitly writing them back.
        if let Ok(img) = image::open(path) {
            // Re-save over the original file; if it fails, it's not a big deal, we just catch the error or propagate.
            if image::save_buffer(
                path,
                img.as_bytes(),
                img.width(),
                img.height(),
                img.color()
            ).is_ok() {
                modified = true;
            }
        }
    }

    Ok(modified)
}

fn main() -> Result<(), io::Error> {
    // setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // create app and run it
    let app = App::new();
    let res = run_app(&mut terminal, app);

    // restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("{:?}", err)
    }

    Ok(())
}

fn run_app<B: Backend>(terminal: &mut Terminal<B>, mut app: App) -> io::Result<()> 
where 
    io::Error: From<<B as Backend>::Error> 
{
    loop {
        terminal.draw(|f| ui(f, &app))?;

        if let Event::Key(key) = event::read()? {
            if key.kind != KeyEventKind::Press {
                continue;
            }
            match app.input_mode {
                InputMode::Normal => match key.code {
                    KeyCode::Char('e') => {
                        app.input_mode = InputMode::Editing;
                    }
                    KeyCode::Char('q') => {
                        return Ok(());
                    }
                    _ => {}
                },
                InputMode::Editing => match key.code {
                    KeyCode::Enter => {
                        let path_str = app.input.clone();
                        app.input.clear();
                        app.input_mode = InputMode::Normal;
                        
                        let path = Path::new(&path_str);
                        if let Err(e) = process_directory(path, &mut app) {
                            app.messages.push(format!("Error: {}", e));
                        }
                    }
                    KeyCode::Char(c) => {
                        app.input.push(c);
                    }
                    KeyCode::Backspace => {
                        app.input.pop();
                    }
                    KeyCode::Esc => {
                        app.input_mode = InputMode::Normal;
                    }
                    _ => {}
                },
            }
        }
    }
}

fn ui(f: &mut ratatui::Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints(
            [
                Constraint::Length(1),
                Constraint::Length(3),
                Constraint::Min(1),
            ]
            .as_ref(),
        )
        .split(f.area());

    let (msg, style) = match app.input_mode {
        InputMode::Normal => (
            vec![
                Span::raw("Press "),
                Span::styled("q", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(" to exit, "),
                Span::styled("e", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(" to enter directory path."),
            ],
            Style::default().add_modifier(Modifier::RAPID_BLINK),
        ),
        InputMode::Editing => (
            vec![
                Span::raw("Press "),
                Span::styled("Esc", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(" to stop editing, "),
                Span::styled("Enter", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(" to strip metadata."),
            ],
            Style::default(),
        ),
    };
    let text = ratatui::text::Text::from(Line::from(msg)).patch_style(style);
    let help_message = Paragraph::new(text);
    f.render_widget(help_message, chunks[0]);

    let input = Paragraph::new(app.input.as_str())
        .style(match app.input_mode {
            InputMode::Normal => Style::default(),
            InputMode::Editing => Style::default().fg(Color::Yellow),
        })
        .block(Block::default().borders(Borders::ALL).title("Target Directory"));
    f.render_widget(input, chunks[1]);
    
    match app.input_mode {
        InputMode::Normal => {},
        InputMode::Editing => {
            f.set_cursor_position(ratatui::layout::Position::new(
                chunks[1].x + app.input.len() as u16 + 1,
                chunks[1].y + 1,
            ));
        }
    }

    let messages: Vec<ListItem> = app
        .messages
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let content = vec![Line::from(Span::raw(format!("{}: {}", i, m)))];
            ListItem::new(content)
        })
        .collect();
    let messages = List::new(messages).block(Block::default().borders(Borders::ALL).title("Logs"));
    f.render_widget(messages, chunks[2]);
}
