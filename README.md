### Requirement:
- This project is built using **Java 21** and **Maven**.
- Download the **JavaFX SDK** and **JavaFX jmods** from [this link](https://gluonhq.com/products/javafx/).

### Getting Started:
You can test the project by running the following command:
```
mvn javafx:run
```

### Build:
Build the main JAR file and all other necessary dependencies:
```
mvn clean package
```

You need to create a **JRE runtime image**, which will be embedded into the final package. By default, `jpackage` creates the runtime image, but it does not include certain runtime libraries required to run JavaFX programs.  
We can manually create a custom runtime image and build the package afterward.

#### MacOS

```
# Set the path to JavaFX jmods
export PATH_TO_FX_MODS=path/to/javafx-jmods
export APP_VERSION=1.0.1

# Create a custom runtime image
jlink \
  --module-path "$JAVA_HOME/jmods:$PATH_TO_FX_MODS" \
  --add-modules java.naming,java.sql,java.logging,javafx.controls,javafx.fxml \
  --output jre
  
# Build and package for different MacOSX types
for type in "app-image" "dmg" "pkg"
jpackage --type $type \
  --name DogyMpegApp \
  --input target \
  --main-jar DogyMPEGApp.jar \
  --main-class com.chotoxautinh.Main \
  --java-options "-Xmx2048m" \
  --runtime-image jre \
  --app-version $APP_VERSION \
  --vendor "Dogy Inc." \
  --copyright "Copyright © 2016-$(date +%y) Dogy Inc." \
  --mac-package-name "DogyMpegApp" \
  --mac-package-identifier com.chotoxautinh \
  --icon src/main/resources/icon.icns \
  --dest dist/jpackage/mac
```

#### Windows
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
$env:APP_VERSION="1.0.1"

# Create a custom runtime image
jlink --module-path "$env:JAVA_HOME\jmods;$env:PATH_TO_FX_MODS" `
      --add-modules java.naming,java.sql,java.logging,javafx.controls,javafx.fxml `
      --output jre
      
# Build and package for different Windows types
$TYPES = @("app-image", "exe", "msi")
foreach ($T in $TYPES) {
    jpackage --type $T `
        --input target `
        --name DogyMpegApp `
        --main-jar "DogyMPEGApp.jar" `
        --main-class "com.chotoxautinh.Main" `
        --java-options "-Xmx2048m" `
        --runtime-image jre `
        --icon "src\main\resources\icon.ico" `
        --app-version "$env:APP_VERSION" `
        --vendor "Dogy Inc." `
        --copyright "Copyright © 2016-$((Get-Date).Year.ToString().Substring(2)) Dogy Inc." `
        --dest dist/jpackage/win
}
```