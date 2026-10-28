use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

struct DiscordState {
    client: Mutex<Option<DiscordIpcClient>>,
}

fn make_activity() -> activity::Activity<'static> {
    static START_TIME: OnceLock<u64> = OnceLock::new();
    let start_time = *START_TIME.get_or_init(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    });

    activity::Activity::new()
        .activity_type(activity::ActivityType::Watching)
        // .details("Watching Prime Video")
        // .state("Browsing...")
        // .assets(
        //     activity::Assets::new()
        //         .large_image("prime-logo") // You need to upload this asset in your Discord App
        //         .large_text("Prime Video"),
        // )
        .timestamps(activity::Timestamps::new().start(start_time as i64))
}

#[tauri::command]
fn update_activity(
    discord: tauri::State<DiscordState>,
    details: Option<String>,
    status: Option<String>,
    image: Option<String>,
    start: Option<i64>,
    end: Option<i64>,
) {
    let mut client_lock = discord.client.lock().unwrap();
    let Some(client) = client_lock.as_mut() else {
        return;
    };
    let Some(details) = details.as_deref() else {
        if client.set_activity(make_activity()).is_ok() {
            let _ = client.recv();
        }
        return;
    };
    let mut act: activity::Activity = make_activity().details(details);
    if let Some(status) = status.as_deref() {
        act = act.state(status);
    }
    if let Some(image) = image.as_deref() {
        act = act.assets(activity::Assets::new().large_image(image).large_text(details));
    }
    if let (Some(start), Some(end)) = (start, end) {
        act = act.timestamps(activity::Timestamps::new().start(start).end(end));
    }
    if client.set_activity(act).is_err() {
        println!("Failed to set Discord activity.");
    } else {
        let _ = client.recv();
    }
}

fn adguard_path() -> String {
    let exe_path = std::env::current_exe().expect("Failed to get current exe path");
    let exe_dir = exe_path.parent().expect("Failed to get parent directory");
    exe_dir.join("adg").to_str().unwrap().to_string()
}

fn browser_args() -> String {
    let cdp_flag = if cfg!(debug_assertions) {
        " --remote-debugging-port=9222"
    } else {
        ""
    };
    format!("--load-extension=\"{}\" --disable-gpu{}", adguard_path(), cdp_flag)
}

fn extension_id(path: &str) -> String {
    use sha2::{Digest, Sha256};
    let bytes: Vec<u8> = path.encode_utf16().flat_map(u16::to_le_bytes).collect();
    Sha256::digest(&bytes)[..16]
        .iter()
        .flat_map(|b| [b >> 4, b & 0x0f])
        .map(|n| (b'a' + n) as char)
        .collect()
}

#[tauri::command]
async fn open_extension_page(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if matches!(url.scheme(), "http" | "https") {
        return app
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(|e| e.to_string());
    }
    if url.scheme() != "chrome-extension"
        || url.host_str() != Some(extension_id(&adguard_path()).as_str())
    {
        return Err("unsupported url".into());
    }
    let page = url
        .path()
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .trim_end_matches(".html")
        .to_string();
    let label = format!("adguard-{}", page);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(url))
        .title("AdGuard")
        .inner_size(1100.0, 800.0)
        .background_color(tauri::utils::config::Color(45, 45, 45, 255))
        .browser_extensions_enabled(true)
        .additional_browser_args(&browser_args())
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn refresh_extension_worker(app: &tauri::App) {
    use sha2::{Digest, Sha256};
    let adg = std::path::PathBuf::from(adguard_path());
    let mut hasher = Sha256::new();
    for file in ["manifest.json", "pvt-background.js", "pages/background.js"] {
        hasher.update(std::fs::read(adg.join(file)).unwrap_or_default());
    }
    let digest = format!("{:x}", hasher.finalize());
    let Ok(dir) = app.path().app_local_data_dir() else {
        return;
    };
    let marker = dir.join("adg-digest");
    if std::fs::read_to_string(&marker).ok().as_deref() == Some(digest.as_str()) {
        return;
    }
    let worker = dir.join("EBWebView").join("Default").join("Service Worker");
    let _ = std::fs::remove_dir_all(worker.join("ScriptCache"));
    let _ = std::fs::remove_dir_all(worker.join("Database"));
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(marker, digest);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::env;

    let discord_state = DiscordState {
        client: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(discord_state)
        .setup(move |app| {
            let handle = app.handle();
            let discord_state: tauri::State<DiscordState> = handle.state();
            let mut client_lock = discord_state.client.lock().unwrap();
            let mut client = DiscordIpcClient::new("739528267039768647");

            if client.connect().is_ok() {
                if client.set_activity(make_activity()).is_err() {
                    println!("Failed to set Discord activity.");
                }
                *client_lock = Some(client);
            } else {
                println!("Failed to connect to Discord.");
            }

            refresh_extension_worker(app);

            #[allow(unused_mut)]
            let mut builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("https://www.amazon.co.jp/gp/video/storefront".into()),
            )
            .title("Prime Video Tauri")
            .inner_size(1280.0, 800.0)
            .min_inner_size(990.0, 600.0)
            .background_color(tauri::utils::config::Color(45, 45, 45, 255))
            .decorations(false)
            .browser_extensions_enabled(true)
            .additional_browser_args(&browser_args());

            #[cfg(target_os = "windows")]
            {
                builder = builder
                    .initialization_script(include_str!(concat!(env!("OUT_DIR"), "/inject.js")));
            }

            builder.build()?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![update_activity, open_extension_page])
        .run(tauri::generate_context!())
        .expect("アプリケーションの起動中にエラーが発生しました。");
}
