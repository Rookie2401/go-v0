# The Go mark (the G and the globe, in the Western Canon brown #6b4f2a on paper #f7f2e8; packages/shared-brand) drawn at every icon size
# the family ships: the extension (16-128), the hosted setup app (180, 192, 512), GoReview / GoPractice (180, 192, 512, maskable 512)
# and the GoReview iPhone app (1024, opaque). Run after changing packages/shared-brand/go-icon-source.png:
#   powershell -File scripts/sync-go-brand.ps1
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$repo=Split-Path $PSScriptRoot -Parent
$source=[Drawing.Image]::FromFile((Join-Path $repo 'packages\shared-brand\go-icon-source.png'))
function Export-GoIcon([string]$relative,[int]$size) {
  $target=Join-Path $repo $relative
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
  $bitmap=[Drawing.Bitmap]::new($size,$size,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#F7F2E8'))
    $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source,0,0,$size,$size)
    $bitmap.Save($target,[Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
#  The iPhone launch screen (Splash.imageset, three 2732 px copies the storyboard shows aspect-filled): the transparent mark, centred on paper,
#  a little over a third of the width, so it stays whole on every phone's crop.
$logo=[Drawing.Image]::FromFile((Join-Path $repo 'packages\shared-brand\go-logo.png'))
function Export-GoSplash([string]$relative,[int]$size) {
  $target=Join-Path $repo $relative
  $bitmap=[Drawing.Bitmap]::new($size,$size,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#F7F2E8'))
    $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $w=[int]($size*0.38); $h=[int]($w*$logo.Height/$logo.Width)
    $graphics.DrawImage($logo,[int](($size-$w)/2),[int](($size-$h)/2),$w,$h)
    $bitmap.Save($target,[Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
  foreach ($size in @(16,32,48,128)) { Export-GoIcon "packages\golearn-extension\icons\icon-$size.png" $size }
  # the transparent master beside the extension icons: the action popup draws it as a CSS mask (copyStatic ships the whole folder)
  Copy-Item (Join-Path $repo 'packages\shared-brand\go-logo.png') (Join-Path $repo 'packages\golearn-extension\icons\go-logo.png') -Force
  foreach ($name in @('splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png')) { Export-GoSplash "packages\goreview-ios\ios\App\App\Assets.xcassets\Splash.imageset\$name" 2732 }
  foreach ($size in @(192,512)) {
    Export-GoIcon "packages\golearn-extension\app\icons\icon-$size.png" $size
    Export-GoIcon "packages\gopractice\public\icons\icon-$size.png" $size
  }
  Export-GoIcon 'packages\golearn-extension\app\icons\apple-touch-icon.png' 180
  Export-GoIcon 'packages\gopractice\public\icons\apple-touch-icon.png' 180
  Export-GoIcon 'packages\gopractice\public\icons\icon-maskable-512.png' 512
  Export-GoIcon 'packages\goreview-ios\assets\icon.png' 1024
  Export-GoIcon 'packages\goreview-ios\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png' 1024
} finally { $source.Dispose(); $logo.Dispose() }
Write-Output 'GoLearn and GoReview icons and the iPhone launch screen synchronized (the brown Go mark).'
