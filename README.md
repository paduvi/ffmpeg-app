# DogyMpegApp - Video Processing Utility

DogyMpegApp is a desktop GUI application built with Java 21 and JavaFX, designed to simplify common video processing tasks. It acts as a user-friendly wrapper around **FFmpeg**, allowing users to compress, cut, and manage video files without needing to use command-line arguments.

## Key Features

*   **Video Compression:** Reduce video file sizes with customizable presets and quality settings.
*   **Video Cutting:** Trim video clips precisely.
*   **Frame Extraction:** Extract sample images or frames from video files.
*   **Batch Processing:** Handle video tasks efficiently with progress tracking.
*   **User-Friendly Interface:** Clean JavaFX-based GUI for easy navigation and configuration.

## Technology Stack

*   **Language:** Java 21
*   **GUI Framework:** JavaFX
*   **Core Engine:** FFmpeg (via command-line wrapper)
*   **Database:** SQLite (for internal data/configuration)
*   **Build Tool:** Maven

## Prerequisites
- This project is built using **Java 21** and **Maven**.
- Download the **JavaFX SDK** and **JavaFX jmods** from [this link](https://gluonhq.com/products/javafx/).

## Getting Started
You can test the project by running the following command:
```
mvn javafx:run
```

## Usage

Launch the application to access the main dashboard. From there, you can navigate to specific tools via the menu to start compressing or cutting your video files.

## Build
Build the main JAR file and all other necessary dependencies:
```
mvn clean package
```

You need to create a **JRE runtime image**, which will be embedded into the final package. By default, `jpackage` creates the runtime image, but it does not include certain runtime libraries required to run JavaFX programs.  
We can manually create a custom runtime image and build the package afterward.

### MacOS

```
# Set the path to JavaFX jmods
export PATH_TO_FX_MODS=path/to/javafx-jmods
export APP_VERSION=1.0.2

# Create a custom runtime image
jlink \
  --module-path "$JAVA_HOME/jmods:$PATH_TO_FX_MODS" \
  --add-modules java.naming,java.sql,java.logging,javafx.controls,javafx.fxml \
  --output jre
  
# Build and package for different MacOSX types
YEAR_SHORT="$(date +%y)"
for TYPE in app-image dmg pkg; do
  echo "===> Building $TYPE"
  jpackage --type "$TYPE" \
    --name DogyMpegApp \
    --input target/app \
    --main-jar DogyMPEGApp.jar \
    --main-class com.chotoxautinh.Main \
    --java-options "-Xmx2048m" \
    --runtime-image jre \
    --app-version "$APP_VERSION" \
    --vendor "Dogy Inc." \
    --copyright "Copyright © 2016-${YEAR_SHORT} Dogy Inc." \
    --mac-package-name "DogyMpegApp" \
    --mac-package-identifier com.chotoxautinh \
    --icon src/main/resources/icon.icns \
    --dest dist/jpackage/mac
done
```

### Windows
There are 3 file types for Windows:
1. `app-image`:
This type creates a directory containing your application and a custom JRE. It's not an installer; rather, it's a portable directory that can be run directly.
You can compress this directory into a .zip file for distribution. Once users extract it, they can run the .exe file inside.
This is a good choice for internal distribution or when you prefer more manual control over the installation process.

2. `exe`:
This type generates a direct executable file (.exe).
Typically, it creates a basic installer that then installs the application into the Program Files or AppData directory and creates shortcuts.

3. `msi`:
This type produces a Windows Installer file (.msi).
An .msi file provides a standard Windows installation and uninstallation experience, integrating well with Windows' application management system.


To use `exe` and `msi` options, you need to install [WiX Toolset](https://github.com/wixtoolset/wix3/releases) on your Windows system. jpackage leverages WiX to generate the package.

```
# Set the path to JavaFX jmods
$env:PATH_TO_FX_MODS="path/to/javafx-jmods"
$env:APP_VERSION="1.0.2"

# Create a custom runtime image
jlink --module-path "$env:JAVA_HOME\jmods;$env:PATH_TO_FX_MODS" `
      --add-modules java.naming,java.sql,java.logging,javafx.controls,javafx.fxml `
      --output jre
      
# Build and package for different Windows types
$yearShort = (Get-Date).Year.ToString().Substring(2)
$types = @("app-image", "exe", "msi")
foreach ($t in $types) {
    Write-Host "===> Building $t"
    jpackage --type $t `
        --input target/app `
        --name DogyMpegApp `
        --main-jar "DogyMPEGApp.jar" `
        --main-class "com.chotoxautinh.Main" `
        --java-options "-Xmx2048m" `
        --runtime-image jre `
        --icon "src\main\resources\icon.ico" `
        --app-version "$env:APP_VERSION" `
        --vendor "Dogy Inc." `
        --copyright "Copyright © 2016-$yearShort Dogy Inc." `
        --dest dist/jpackage/win
    if ($LASTEXITCODE -ne 0) { throw "jpackage failed for type=$t" }
}
```

## License

This project is licensed under the MIT License.

Copyright (c) 2016-2025 Dogy Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
