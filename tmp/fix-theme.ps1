$files = Get-ChildItem -Path "apps/onboarding/src/components/onboarding" -Filter "*.tsx" -Recurse

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # Typography
    $content = $content.Replace("text-white", "text-foreground")
    $content = $content.Replace("text-neutral-400", "text-muted-foreground")
    $content = $content.Replace("text-neutral-500", "text-muted-foreground")
    $content = $content.Replace("text-neutral-600", "text-muted-foreground")
    
    # Buttons
    $content = $content.Replace("w-full bg-white text-black hover:bg-neutral-200 mt-6", "w-full mt-6")
    $content = $content.Replace("w-full bg-white text-black hover:bg-neutral-200 mt-4", "w-full mt-4")
    $content = $content.Replace("w-full bg-white text-black hover:bg-neutral-200 mt-2", "w-full mt-2")
    $content = $content.Replace("w-full bg-white text-black hover:bg-neutral-200", "w-full")
    $content = $content.Replace("flex-1 bg-white text-black hover:bg-neutral-200", "flex-1")
    $content = $content.Replace("flex-1 bg-transparent border-neutral-700 text-foreground hover:bg-neutral-800", "flex-1")
    $content = $content.Replace("hover:bg-neutral-800/50", "hover:bg-accent hover:text-accent-foreground")
    
    # Inputs & Validation
    $content = $content.Replace("bg-neutral-950 border-neutral-800 focus:border-neutral-700 focus:ring-neutral-700", "bg-background border-input focus:border-ring focus:ring-ring")
    $content = $content.Replace("bg-neutral-950", "bg-background")
    $content = $content.Replace("border-neutral-800", "border-input")
    $content = $content.Replace("text-red-500", "text-destructive")
    $content = $content.Replace("border-red-500", "border-destructive")
    
    # Progress Bar
    $content = $content.Replace("bg-neutral-800", "bg-muted")
    $content = $content.Replace("text-black", "text-background")
    
    [System.IO.File]::WriteAllText($file.FullName, $content)
}
