# Format/size exports of the unchanged generated logo for native app bundles
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconWorkspace = Split-Path -Parent $PSScriptRoot
$logoSource = [Drawing.Bitmap]::new((Join-Path $iconWorkspace 'public/assets/wow-companion-logo.png'))
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives -TypeDefinition @'
using System.Drawing;
public static class WowIconBounds {
  public static Rectangle Find(Bitmap image) {
    int left=image.Width, top=image.Height, right=-1, bottom=-1;
    for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
      if(image.GetPixel(x,y).A<128) continue;
      left=System.Math.Min(left,x);top=System.Math.Min(top,y);
      right=System.Math.Max(right,x);bottom=System.Math.Max(bottom,y);
    }
    if(right<left) throw new System.InvalidOperationException("Logo has no visible pixels");
    return Rectangle.FromLTRB(left,top,right+1,bottom+1);
  }
}
'@
$logoBounds = [WowIconBounds]::Find($logoSource)
function Get-LogoPng([int]$pixels) {
  $bitmap = [Drawing.Bitmap]::new($pixels, $pixels, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $buffer = [IO.MemoryStream]::new()
  try {
    $graphics.Clear([Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($logoSource, [Drawing.Rectangle]::new(0,0,$pixels,$pixels), $logoBounds, [Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save($buffer, [Drawing.Imaging.ImageFormat]::Png)
    return ,$buffer.ToArray()
  } finally { $buffer.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
function Write-BigEndian([IO.BinaryWriter]$writer, [int]$value) {
  $bytes = [BitConverter]::GetBytes($value)
  [Array]::Reverse($bytes)
  $writer.Write($bytes)
}
try {
  [IO.File]::WriteAllBytes((Join-Path $iconWorkspace 'public/assets/wow-companion-icon.png'), (Get-LogoPng 1024))
  $frames = @(16, 24, 32, 48, 64, 128, 256 | ForEach-Object { @{ Size = $_; Bytes = (Get-LogoPng $_) } })
  $ico = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $iconWorkspace 'public/assets/wow-companion.ico')))
  try {
    $ico.Write([UInt16]0); $ico.Write([UInt16]1); $ico.Write([UInt16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
      $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
      $ico.Write([byte]$dimension); $ico.Write([byte]$dimension)
      $ico.Write([byte]0); $ico.Write([byte]0); $ico.Write([UInt16]1); $ico.Write([UInt16]32)
      $ico.Write([UInt32]$frame.Bytes.Length); $ico.Write([UInt32]$offset)
      $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $ico.Write([byte[]]$frame.Bytes) }
  } finally { $ico.Dispose() }
  $macTypes = @('icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10')
  $macSizes = @(16, 32, 64, 128, 256, 512, 1024)
  $macFrames = @(0..6 | ForEach-Object { @{ Type = $macTypes[$_]; Bytes = (Get-LogoPng $macSizes[$_]) } })
  $icns = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $iconWorkspace 'public/assets/wow-companion.icns')))
  try {
    $icns.Write([Text.Encoding]::ASCII.GetBytes('icns'))
    Write-BigEndian $icns (8 + (($macFrames | ForEach-Object { 8 + $_.Bytes.Length }) | Measure-Object -Sum).Sum)
    foreach ($frame in $macFrames) {
      $icns.Write([Text.Encoding]::ASCII.GetBytes($frame.Type))
      Write-BigEndian $icns (8 + $frame.Bytes.Length)
      $icns.Write([byte[]]$frame.Bytes)
    }
  } finally { $icns.Dispose() }
} finally { $logoSource.Dispose() }
