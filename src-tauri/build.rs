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

    println!("cargo:rerun-if-changed=src/pvt-background.js");
    println!("cargo:rerun-if-changed=adg/manifest.json");
    patch_adguard();

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["update_activity", "open_extension_page"])),
    )
    .expect("failed to run tauri-build");
}

fn write_if_changed(path: &str, contents: &str) {
    if std::fs::read_to_string(path).ok().as_deref() != Some(contents) {
        std::fs::write(path, contents).unwrap_or_else(|e| panic!("failed to write {path}: {e}"));
    }
}

fn patch_adguard() {
    const WORKER: &str = "pvt-background.js";
    let Ok(manifest) = std::fs::read_to_string("adg/manifest.json") else {
        return;
    };
    let parsed: serde_json::Value = serde_json::from_str(&manifest).expect("failed to parse adg/manifest.json");
    let current = parsed["background"]["service_worker"].as_str().unwrap_or_default().to_string();
    if current != WORKER {
        let patched = manifest.replacen(&format!("\"{current}\""), &format!("\"{WORKER}\""), 1);
        write_if_changed("adg/manifest.json", &patched);
    }
    let worker = std::fs::read_to_string("src/pvt-background.js").expect("failed to read pvt-background.js");
    write_if_changed(&format!("adg/{WORKER}"), &worker);
}
