use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const SETTINGS_VERSION: u32 = 2;
const MAX_REPLAY_BYTES: u64 = 16 * 1024 * 1024;
const DEFAULT_WINDOW_SCALE: u32 = 3;
const MAX_WINDOW_SCALE: u32 = 8;

/// The actions the front-end can bind, in the bit order recordings use.
/// Kept in step with REPLAY_ACTIONS in src/core/Replay.ts.
const BINDABLE_ACTIONS: [&str; 7] = [
    "move_left",
    "move_right",
    "move_up",
    "move_down",
    "jump",
    "dash",
    "fire",
];

/// Two `KeyboardEvent.code` slots per action; an empty string is unbound.
type KeyBindings = BTreeMap<String, [String; 2]>;

fn default_bindings() -> KeyBindings {
    [
        ("move_left", ["ArrowLeft", "KeyA"]),
        ("move_right", ["ArrowRight", "KeyD"]),
        ("move_up", ["ArrowUp", "KeyW"]),
        ("move_down", ["ArrowDown", "KeyS"]),
        ("jump", ["Space", "KeyK"]),
        ("dash", ["ShiftLeft", "KeyL"]),
        ("fire", ["KeyJ", "KeyF"]),
    ]
    .into_iter()
    .map(|(action, slots)| {
        (
            action.to_owned(),
            [slots[0].to_owned(), slots[1].to_owned()],
        )
    })
    .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopSettings {
    version: u32,
    master_volume: f64,
    #[serde(default = "default_window_scale")]
    scale: u32,
    fullscreen: bool,
    pause_on_blur: bool,
    bindings: KeyBindings,
}

fn default_window_scale() -> u32 {
    DEFAULT_WINDOW_SCALE
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            master_volume: 1.0,
            scale: DEFAULT_WINDOW_SCALE,
            fullscreen: false,
            pause_on_blur: true,
            bindings: default_bindings(),
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
        if !(1..=MAX_WINDOW_SCALE).contains(&self.scale) {
            return Err(format!(
                "scale must be an integer between 1 and {MAX_WINDOW_SCALE}"
            ));
        }
        // Exactly the known actions, no more and no fewer: a binding for an action
        // the game cannot dispatch is unreachable, and a missing one would leave
        // that action silently dead on the next launch.
        if self.bindings.len() != BINDABLE_ACTIONS.len()
            || !BINDABLE_ACTIONS
                .iter()
                .all(|action| self.bindings.contains_key(*action))
        {
            return Err(format!(
                "bindings must cover exactly these actions: {}",
                BINDABLE_ACTIONS.join(", ")
            ));
        }
        Ok(())
    }
}

/// Bring a stored file forward to the current version.
///
/// v1 predates rebinding, so it gains the default map rather than being
/// rejected — the alternative resets a player's volume the first time they
/// launch a build that has a settings menu.
fn migrate_settings(mut value: serde_json::Value) -> serde_json::Value {
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1) {
        return value;
    }
    if let Some(object) = value.as_object_mut() {
        object.insert("version".into(), serde_json::json!(SETTINGS_VERSION));
        object.insert(
            "bindings".into(),
            serde_json::to_value(default_bindings()).unwrap_or(serde_json::Value::Null),
        );
    }
    value
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
    let stored: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("invalid settings in {}: {error}", path.display()))?;
    let settings: DesktopSettings = serde_json::from_value(migrate_settings(stored))
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

    #[test]
    fn settings_reject_unknown_or_missing_bindings() {
        let mut settings = DesktopSettings::default();
        settings.bindings.remove("dash");
        assert!(settings.validate().is_err());

        let mut settings = DesktopSettings::default();
        settings
            .bindings
            .insert("teleport".into(), ["KeyT".into(), String::new()]);
        assert!(settings.validate().is_err());
    }

    #[test]
    fn settings_reject_invalid_scale() {
        let settings = DesktopSettings {
            scale: 0,
            ..DesktopSettings::default()
        };
        assert!(settings.validate().is_err());

        let settings = DesktopSettings {
            scale: MAX_WINDOW_SCALE + 1,
            ..DesktopSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn v2_settings_without_scale_default_to_3x() {
        let stored = serde_json::json!({
            "version": 2,
            "masterVolume": 0.5,
            "fullscreen": false,
            "pauseOnBlur": true,
            "bindings": default_bindings(),
        });
        let settings: DesktopSettings =
            serde_json::from_value(stored).expect("v2 settings without scale should load");
        assert!(settings.validate().is_ok());
        assert_eq!(settings.scale, DEFAULT_WINDOW_SCALE);
    }

    #[test]
    fn v1_settings_migrate_with_default_bindings() {
        let stored = serde_json::json!({
            "version": 1,
            "masterVolume": 0.4,
            "fullscreen": true,
            "pauseOnBlur": false,
        });
        let settings: DesktopSettings =
            serde_json::from_value(migrate_settings(stored)).expect("v1 settings should migrate");
        assert!(settings.validate().is_ok());
        // The player's own choices survive; only the new field is defaulted.
        assert_eq!(settings.master_volume, 0.4);
        assert!(settings.fullscreen);
        assert_eq!(settings.bindings, default_bindings());
    }
}
