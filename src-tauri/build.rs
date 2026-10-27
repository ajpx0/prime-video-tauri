use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=src/script.js");
    println!("cargo:rerun-if-changed=src/custom.css");

    let css = std::fs::read_to_string("src/custom.css").expect("failed to read custom.css");
    let script = std::fs::read_to_string("src/script.js").expect("failed to read script.js");
    let json = serde_json::to_string(&css).expect("failed to encode custom.css");
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR not set");
    let out = Path::new(&out_dir).join("inject.js");
    std::fs::write(out, script.replace("__PVT_CSS__", &json)).expect("failed to write inject.js");

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["update_activity"])),
    )
    .expect("failed to run tauri-build");
}
