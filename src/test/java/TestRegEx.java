import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TestRegEx {
    public static void main(String[] args) {
        Pattern pattern = Pattern.compile("^.*time=(\\d+:\\d+:\\d+.\\d+).*");
        String text = "speframe=  236 fps= 24 q=28.0 q=28.0 size=    1693kB time=00:00:09.53 bitrate=1454.2kbits/s";
        Matcher matcher = pattern.matcher(text);
        System.out.println(matcher.matches());
        System.out.println(matcher.group(1));
    }
}
