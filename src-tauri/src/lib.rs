use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const SETTINGS_VERSION: u32 = 1;
const MAX_REPLAY_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopSettings {
    version: u32,
    master_volume: f64,
    fullscreen: bool,
    pause_on_blur: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            master_volume: 1.0,
            fullscreen: false,
            pause_on_blur: true,
        }
    }
}

impl DesktopSettings {
    fn validate(&self) -> Result<(), String> {
        if self.version != SETTINGS_VERSION {
            return Err(format!(
                "unsupported settings version {} (expected {SETTINGS_VERSION})",
                self.version
            ));
        }
        if !self.master_volume.is_finite() || !(0.0..=1.0).contains(&self.master_volume) {
            return Err("masterVolume must be between 0 and 1".into());
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayFile {
    path: String,
    contents: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve application data directory: {error}"))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

fn replay_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("replays"))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    ensure_parent(path)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, contents)
        .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;

    // Windows does not replace an existing destination with fs::rename. Settings
    // are recoverable defaults, while replay save paths come from a user-confirmed
    // dialog, so removing the old destination immediately before the rename is the
    // least surprising cross-platform behaviour.
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("could not replace {}: {error}", path.display()))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("could not finalize {}: {error}", path.display()))
}

fn read_replay(path: &Path) -> Result<ReplayFile, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("could not inspect {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }
    if metadata.len() > MAX_REPLAY_BYTES {
        return Err(format!(
            "replay is too large ({} bytes; limit is {MAX_REPLAY_BYTES})",
            metadata.len()
        ));
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    Ok(ReplayFile {
        path: path.to_string_lossy().into_owned(),
        contents,
    })
}

fn safe_replay_name(suggested_name: &str) -> String {
    let mut name: String = suggested_name
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => character,
            _ => '-',
        })
        .collect();
    if name.is_empty() {
        name = "mmx-replay.json".into();
    }
    if !name.to_ascii_lowercase().ends_with(".json") {
        name.push_str(".json");
    }
    name
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<DesktopSettings, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(DesktopSettings::default());
    }
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let settings: DesktopSettings = serde_json::from_str(&text)
        .map_err(|error| format!("invalid settings in {}: {error}", path.display()))?;
    settings.validate()?;
    Ok(settings)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: DesktopSettings) -> Result<(), String> {
    settings.validate()?;
    let text = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("could not encode settings: {error}"))?;
    write_atomic(&settings_path(&app)?, &format!("{text}\n"))
}

#[tauri::command]
async fn save_replay(
    app: AppHandle,
    contents: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    if contents.len() as u64 > MAX_REPLAY_BYTES {
        return Err(format!("replay exceeds the {MAX_REPLAY_BYTES} byte limit"));
    }
    let directory = replay_dir(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;
    let selected = rfd::AsyncFileDialog::new()
        .set_title("Save MMX replay")
        .set_directory(directory)
        .set_file_name(safe_replay_name(&suggested_name))
        .add_filter("MMX replay", &["json"])
        .save_file()
        .await;
    let Some(file) = selected else {
        return Ok(None);
    };
    let path = file.path();
    write_atomic(path, &contents)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn open_replay(app: AppHandle) -> Result<Option<ReplayFile>, String> {
    let directory = replay_dir(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;
    let selected = rfd::AsyncFileDialog::new()
        .set_title("Open MMX replay")
        .set_directory(directory)
        .add_filter("MMX replay", &["json"])
        .pick_file()
        .await;
    selected.map(|file| read_replay(file.path())).transpose()
}

#[tauri::command]
fn read_replay_path(path: String) -> Result<ReplayFile, String> {
    read_replay(Path::new(&path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            save_replay,
            open_replay,
            read_replay_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running the desktop application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replay_names_are_safe_and_keep_the_extension() {
        assert_eq!(safe_replay_name("stage 1/replay"), "stage-1-replay.json");
        assert_eq!(safe_replay_name("good.replay.json"), "good.replay.json");
    }

    #[test]
    fn settings_reject_invalid_volume() {
        let settings = DesktopSettings {
            master_volume: 1.5,
            ..DesktopSettings::default()
        };
        assert!(settings.validate().is_err());
    }
}
