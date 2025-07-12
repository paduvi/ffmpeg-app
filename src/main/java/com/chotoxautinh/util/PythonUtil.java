package com.chotoxautinh.util;

import com.chotoxautinh.model.Constants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class PythonUtil {
    private static final Logger LOGGER = LoggerFactory.getLogger(PythonUtil.class);
    private static final Pattern VERSION_PATTERN = Pattern.compile("Python \\d+\\.\\d+(\\.\\d+)?");

    private static final String PYTHON_VERSION = "3.12.9";
    private static final String PIP_URL = "https://bootstrap.pypa.io/get-pip.py";
    public static final String PYTHON_DIR = "python";

    public static boolean isPythonAvailable() throws IOException, URISyntaxException, InterruptedException {
        if (!System.getProperty("os.name").toLowerCase().contains("win")) {
            return checkPythonCommand("python") || checkPythonCommand("python3");
        }
        if (new File(Constants.DATA_PATH + File.separator + PYTHON_DIR).exists()) {
            return true;
        }
        downloadAndInstallPython(Path.of(Constants.DATA_PATH));
        return true;
    }

    public static void downloadAndInstallPython(Path installDir) throws IOException, InterruptedException, URISyntaxException {
        Path pythonDir = installDir.resolve(PYTHON_DIR);
        Path downloadZip = installDir.resolve("python_embed.zip");
        Path getPip = pythonDir.resolve("get-pip.py");

        LOGGER.info("Target install directory: {}", installDir);

        String arch = detectArchitecture();
        String zipFileName = String.format("python-%s-embed-%s.zip", PYTHON_VERSION, arch);
        String pythonUrl = String.format("https://www.python.org/ftp/python/%s/%s", PYTHON_VERSION, zipFileName);

        LOGGER.info("Detected architecture: {}", arch);
        LOGGER.info("Downloading: {}", pythonUrl);

        downloadFile(pythonUrl, downloadZip);

        LOGGER.info("📦 Extracting ZIP...");
        unzip(downloadZip, pythonDir);
        Files.deleteIfExists(downloadZip);

        LOGGER.info("⬇️ Downloading get-pip.py...");
        downloadFile(PIP_URL, getPip);

        LOGGER.info("⚙️ Installing pip...");
        runPython(pythonDir.resolve("python.exe"), pythonDir, "get-pip.py");
        enableImportSite(pythonDir);

        LOGGER.info("✅ Setup complete!");
        LOGGER.info("Python installed at: {}", pythonDir);
    }

    static String detectArchitecture() {
        String arch = System.getProperty("os.arch").toLowerCase();
        if (arch.contains("amd64") || arch.contains("x86_64")) {
            return "amd64";
        } else if (arch.contains("aarch64") || arch.contains("arm64")) {
            return "arm64";
        } else {
            return "win32";
        }
    }

    static void downloadFile(String url, Path target) throws IOException, URISyntaxException {
        try (InputStream in = new URI(url).toURL().openStream()) {
            Files.createDirectories(target.getParent());
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    static void unzip(Path zipFile, Path targetDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile.toFile()))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                Path outPath = targetDir.resolve(entry.getName());
                if (entry.isDirectory()) {
                    Files.createDirectories(outPath);
                } else {
                    Files.createDirectories(outPath.getParent());
                    try (OutputStream out = Files.newOutputStream(outPath)) {
                        byte[] buffer = new byte[4096];
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            out.write(buffer, 0, len);
                        }
                    }
                }
            }
        }
    }

    private static void runPython(Path pythonExe, Path workingDir, String scriptName) throws IOException, InterruptedException {
        if (!Files.exists(pythonExe)) {
            throw new FileNotFoundException("python.exe not found in: " + pythonExe);
        }

        ProcessBuilder pb = new ProcessBuilder(
                pythonExe.toString(),
                scriptName
        );
        pb.directory(workingDir.toFile());
        pb.inheritIO();
        Process p = pb.start();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                LOGGER.info("[script] {}", line);
            }
        }
        int code = p.waitFor();
        if (code != 0) throw new RuntimeException("Python exited with code: " + code);
    }

    private static void enableImportSite(Path pythonDir) throws IOException {
        if (!Files.exists(pythonDir)) {
            throw new FileNotFoundException("Python directory not found: " + pythonDir);
        }

        // Find file ending with ._pth
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(pythonDir, "*._pth")) {
            for (Path pthFile : stream) {
                List<String> lines = Files.readAllLines(pthFile, StandardCharsets.UTF_8);

                // Find line "#import site" and uncomment
                List<String> modified = lines.stream()
                        .map(line -> line.trim().equals("#import site") ? "import site" : line)
                        .collect(Collectors.toList());

                // Rewrite into the original file
                Files.write(pthFile, modified, StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING);
                LOGGER.info("Updated .pth file: {}", pthFile.getFileName());
                return;
            }
            throw new FileNotFoundException("No ._pth file found in: " + pythonDir);
        }
    }

    private static boolean checkPythonCommand(String command) {
        try {
            Process process = new ProcessBuilder(command, "--version")
                    .redirectErrorStream(true)
                    .start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String output = reader.readLine();
            process.waitFor();

            LOGGER.info(output);  // Log for debugging

            return output != null && VERSION_PATTERN.matcher(output.trim()).matches();
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    public static String getDownloadUrlByOS() {
        String os = System.getProperty("os.name").toLowerCase();

        if (os.contains("win")) {
            return "https://www.python.org/downloads/windows/";
        } else if (os.contains("mac")) {
            return "https://www.python.org/downloads/macos/";
        } else if (os.contains("nix") || os.contains("nux") || os.contains("aix")) {
            return "https://www.python.org/downloads/source/";
        } else {
            return "https://www.python.org/downloads/";
        }
    }
}
