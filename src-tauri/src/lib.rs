use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintReceiptRequest {
    printer_name: String,
    content: String,
    copies: u16,
    width_mm: u16,
}

#[cfg(target_os = "windows")]
fn hidden_powershell(script: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut command = std::process::Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Sta",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW);
    command
}

fn validate_print_request(
    request: &PrintReceiptRequest,
    printer_required: bool,
) -> Result<(), String> {
    if printer_required && request.printer_name.trim().is_empty() {
        return Err("Aucune imprimante tickets n'est configurée.".to_string());
    }
    if request.content.trim().is_empty() {
        return Err("Le ticket à imprimer est vide.".to_string());
    }
    if !matches!(request.width_mm, 58 | 80) {
        return Err("La largeur du ticket doit être 58 mm ou 80 mm.".to_string());
    }
    if !(1..=5).contains(&request.copies) {
        return Err("Le nombre de copies doit être compris entre 1 et 5.".to_string());
    }
    Ok(())
}

#[tauri::command]
fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = hidden_powershell(
            "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { [Console]::Out.WriteLine($_) }",
        )
        .output()
        .map_err(|error| format!("Impossible d'interroger les imprimantes Windows : {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        return Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned)
            .collect());
    }
    #[cfg(not(target_os = "windows"))]
    Err("L'impression silencieuse est disponible uniquement sous Windows.".to_string())
}

#[tauri::command]
fn print_receipt_silent(request: PrintReceiptRequest) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use std::process::Stdio;

        validate_print_request(&request, true)?;
        let printer_name = request.printer_name.trim();

        let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$printerName = [Environment]::GetEnvironmentVariable('RESTOPRO_PRINTER_NAME')
$widthMm = [int][Environment]::GetEnvironmentVariable('RESTOPRO_TICKET_WIDTH')
$copies = [int][Environment]::GetEnvironmentVariable('RESTOPRO_PRINT_COPIES')
$content = [Console]::In.ReadToEnd()

$installed = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | Where-Object { $_ -eq $printerName })
if ($installed.Count -ne 1) { throw "Imprimante configurée introuvable : $printerName" }

$queue = $null
try { $queue = Get-CimInstance Win32_Printer -ErrorAction Stop | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1 } catch { $queue = $null }
if ($queue -and ($queue.WorkOffline -or $queue.PrinterStatus -in @(6, 7))) { throw "Imprimante configurée hors ligne ou arrêtée : $printerName" }

$document = [System.Drawing.Printing.PrintDocument]::new()
$document.PrinterSettings.PrinterName = $printerName
if (-not $document.PrinterSettings.IsValid) { throw "Imprimante configurée indisponible : $printerName" }
$document.PrintController = [System.Drawing.Printing.StandardPrintController]::new()
$document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)
$paperWidth = [int][Math]::Round(($widthMm / 25.4) * 100)
$lineCount = [Math]::Max(1, ($content -split "`r?`n").Count)
$paperHeight = [Math]::Max(200, [int](($lineCount + 4) * 18))
$document.DefaultPageSettings.PaperSize = [System.Drawing.Printing.PaperSize]::new('RestoPRO', $paperWidth, $paperHeight)
$fontSize = if ($widthMm -eq 58) { 8.0 } else { 9.0 }
$font = [System.Drawing.Font]::new('Consolas', $fontSize, [System.Drawing.FontStyle]::Regular)
$brush = [System.Drawing.Brushes]::Black
$lines = $content -split "`r?`n"
$document.add_PrintPage({
  param($sender, $eventArgs)
  $y = 4.0
  foreach ($line in $lines) {
    $eventArgs.Graphics.DrawString($line, $font, $brush, 4.0, $y)
    $y += $font.GetHeight($eventArgs.Graphics) + 1.0
  }
  $eventArgs.HasMorePages = $false
})
try {
  for ($copy = 0; $copy -lt $copies; $copy++) { $document.Print() }
} finally {
  $font.Dispose()
  $document.Dispose()
}
"#;

        let mut child = hidden_powershell(script)
            .env("RESTOPRO_PRINTER_NAME", printer_name)
            .env("RESTOPRO_TICKET_WIDTH", request.width_mm.to_string())
            .env("RESTOPRO_PRINT_COPIES", request.copies.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Impossible de lancer l'impression Windows : {error}"))?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Canal d'impression Windows indisponible.".to_string())?
            .write_all(request.content.as_bytes())
            .map_err(|error| format!("Impossible de transmettre le ticket : {error}"))?;
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Impossible de terminer l'impression : {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "Windows n'a pas pu imprimer le ticket.".to_string()
            } else {
                detail
            });
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = request;
        Err("L'impression silencieuse est disponible uniquement sous Windows.".to_string())
    }
}

#[tauri::command]
fn print_receipt_dialog(request: PrintReceiptRequest) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        use std::process::Stdio;

        validate_print_request(&request, false)?;
        let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$widthMm = [int][Environment]::GetEnvironmentVariable('RESTOPRO_TICKET_WIDTH')
$copies = [int][Environment]::GetEnvironmentVariable('RESTOPRO_PRINT_COPIES')
$content = [Console]::In.ReadToEnd()

$document = [System.Drawing.Printing.PrintDocument]::new()
$document.DocumentName = 'Ticket RestoPRO'
$document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)
$paperWidth = [int][Math]::Round(($widthMm / 25.4) * 100)
$lineCount = [Math]::Max(1, ($content -split "`r?`n").Count)
$paperHeight = [Math]::Max(200, [int](($lineCount + 4) * 18))
$document.DefaultPageSettings.PaperSize = [System.Drawing.Printing.PaperSize]::new('RestoPRO', $paperWidth, $paperHeight)
$fontSize = if ($widthMm -eq 58) { 8.0 } else { 9.0 }
$font = [System.Drawing.Font]::new('Consolas', $fontSize, [System.Drawing.FontStyle]::Regular)
$brush = [System.Drawing.Brushes]::Black
$lines = $content -split "`r?`n"
$document.add_PrintPage({
  param($sender, $eventArgs)
  $y = 4.0
  foreach ($line in $lines) {
    $eventArgs.Graphics.DrawString($line, $font, $brush, 4.0, $y)
    $y += $font.GetHeight($eventArgs.Graphics) + 1.0
  }
  $eventArgs.HasMorePages = $false
})

$dialog = [System.Windows.Forms.PrintDialog]::new()
$dialog.Document = $document
$dialog.UseEXDialog = $true
$dialog.AllowCurrentPage = $false
$dialog.AllowSelection = $false
$dialog.AllowSomePages = $false
$result = $dialog.ShowDialog()
$dialog.Dispose()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
  $font.Dispose()
  $document.Dispose()
  [Console]::Out.Write('cancelled')
  exit 0
}

$document.PrintController = [System.Drawing.Printing.StandardPrintController]::new()
$document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)
$document.DefaultPageSettings.PaperSize = [System.Drawing.Printing.PaperSize]::new('RestoPRO', $paperWidth, $paperHeight)
try {
  for ($copy = 0; $copy -lt $copies; $copy++) { $document.Print() }
} finally {
  $font.Dispose()
  $document.Dispose()
}
[Console]::Out.Write('printed')
"#;

        let mut child = hidden_powershell(script)
            .env("RESTOPRO_TICKET_WIDTH", request.width_mm.to_string())
            .env("RESTOPRO_PRINT_COPIES", request.copies.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                format!("Impossible d'ouvrir le dialogue d'impression Windows : {error}")
            })?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| "Canal d'impression Windows indisponible.".to_string())?
            .write_all(request.content.as_bytes())
            .map_err(|error| format!("Impossible de transmettre le ticket : {error}"))?;
        let output = child
            .wait_with_output()
            .map_err(|error| format!("Impossible de terminer l'impression : {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "Windows n'a pas pu ouvrir ou exécuter le dialogue d'impression.".to_string()
            } else {
                detail
            });
        }
        return Ok(String::from_utf8_lossy(&output.stdout).trim() == "printed");
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = request;
        Err("Le dialogue d'impression natif est disponible uniquement sous Windows.".to_string())
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_printers,
            print_receipt_silent,
            print_receipt_dialog
        ])
        .run(tauri::generate_context!())
        .expect("erreur pendant le lancement de RestoPRO");
}
