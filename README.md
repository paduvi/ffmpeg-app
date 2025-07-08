### Requirement:
- This project is using Java 21 and Maven.
- Download the JavaFX SDK and JavaFX jmods in [here](https://gluonhq.com/products/javafx/) 

### Getting started:
You can test the project by using command:
```
mvn javafx:run
```

### Build
Build the main jar file and all other neccessary libs:
```
mvn clean package -Dapp.title="FFMPEG App By Dogy" -Dapp.version="1.0.0"
```

You need to create JRE runtime image which would be embed in the final package. By default, jpackage already do that job, but it does not contain some required runtime libraries to run JavaFX program.
We can create a custom runtime image by ourselves then build the package after that.

#### MacOSX

```
export PATH_TO_FX_MODS=path/to/javafx-jmods
jlink --module-path $PATH_TO_FX_MODS --add-modules javafx.controls,javafx.fxml --output jre

for type in "app-image" "dmg" "pkg"
jpackage --type $type \
  --name DogyMpegApp \
  --input target \
  --main-jar DogyMPEGApp.jar \
  --main-class com.chotoxautinh.Main \
  --java-options -Xmx2048m \
  --runtime-image jre \
  --app-version 1.0.0 \
  --vendor "Dogy Inc." \
  --copyright "Copyright © 2016-25 Dogy Inc." \
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
set PATH_TO_FX_MODS=path/to/javafx-jmods
jlink --module-path %PATH_TO_FX_MODS% --add-modules javafx.controls,javafx.fxml --output jre

set "TYPES=app-image exe msi"
for %T in (%TYPES%) do (jpackage --type %T --input target --name DogyMpegApp --main-jar "DogyMPEGApp.jar" --main-class "com.chotoxautinh.Main" --java-options "-Xmx2048m" --runtime-image jre --icon "src\main\resources\icon.ico" --app-version "1.0.0" --vendor "Dogy Inc." --copyright "Copyright © 2016-25 Dogy Inc." --dest dist/jpackage/win)
```
