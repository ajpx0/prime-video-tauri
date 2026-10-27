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

            let exe_path = std::env::current_exe().expect("Failed to get current exe path");
            let exe_dir = exe_path.parent().expect("Failed to get parent directory");

            let cdp_flag = if cfg!(debug_assertions) {
                " --remote-debugging-port=9222"
            } else {
                ""
            };

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
            .additional_browser_args(
                format!(
                    "--load-extension={} --disable-gpu{}",
                    exe_dir.join("adg").to_str().unwrap(),
                    cdp_flag
                )
                .as_str(),
            );

            #[cfg(target_os = "windows")]
            {
                builder = builder
                    .initialization_script(include_str!(concat!(env!("OUT_DIR"), "/inject.js")));
            }

            builder.build()?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![update_activity])
        .run(tauri::generate_context!())
        .expect("アプリケーションの起動中にエラーが発生しました。");
}
