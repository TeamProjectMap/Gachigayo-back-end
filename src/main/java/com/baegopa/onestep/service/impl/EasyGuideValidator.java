package com.baegopa.onestep.service.impl;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

/** Conservative text rewrite validation. Anything uncertain falls back to the provider's text. */
final class EasyGuideValidator {
    private EasyGuideValidator() {}

    private static final Pattern NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+(?:\\.[0-9]+)?");
    private static final Pattern ROUTE = Pattern.compile("\\(([^()<>→]+)\\s*[>→]\\s*([^()<>→]+)\\)");
    private static final Pattern DIRECTION = Pattern.compile(
            "좌회전|왼쪽|좌측|우회전|오른쪽|우측|직진|앞으로|곧장|똑바로|유턴|뒤로\\s*돌|올라|오르|내려가|내리막");
    // Only whole instructional words may change. Unrecognized words (including arbitrary place names) must remain.
    private static final Pattern ACTION = Pattern.compile(
            "(?<![\\p{L}\\p{N}])(?:"
            + "걸어가(?:요|세요|기)|걸어요|걷(?:기|으세요)|가(?:요|세요|기)|이동(?:해요|하세요|하기)?|"
            + "이용(?:해요|하세요|하기)?|승차(?:해요|하세요)?|하차(?:해요|하세요)?|탑승(?:해요|하세요)?|"
            + "타(?:요|세요|기)|내려(?:요|주세요)|내리(?:세요|기)|갈아타(?:요|세요)|환승(?:해요|하세요)?|"
            + "건너(?:요|세요|기)|돌아가(?:요|세요)|도세요|돌아(?:요|주세요)|꺾어(?:요|주세요)|"
            + "해요|하세요|따라|쭉|약|후|다음|앞|방면|쪽|간선|지선"
            + ")(?![\\p{L}\\p{N}])");
    private static final Pattern PARTICLE = Pattern.compile("(?:쪽으로|에서|까지|으로|을|를|에)(?=$|[^\\p{L}\\p{N}])");

    static boolean isSafe(String original, String easy) {
        if (original == null || easy == null || easy.isBlank()
                || easy.length() > Math.max(80, original.length() * 3)) return false;
        original = normalize(original);
        easy = normalize(easy);
        String context = original;
        // A mode may be added as a clarifying word only when the source identifies that mode.
        if (context.matches("(?s).*(?:버스|간선|지선).*") || context.matches("\\d+\\s*\\(.*")) {
            original = original.replaceAll("버스(?=$|[^\\p{L}\\p{N}])", "");
            easy = easy.replaceAll("버스(?=$|[^\\p{L}\\p{N}])", "");
        }
        if (context.contains("호선") || context.contains("지하철")) {
            original = original.replaceAll("지하철(?=$|[^\\p{L}\\p{N}])", "");
            easy = easy.replaceAll("지하철(?=$|[^\\p{L}\\p{N}])", "");
        }
        // Compare complete numbers, their multiplicity and the ordered direction instructions.
        if (!bag(NUMBER, original).equals(bag(NUMBER, easy))
                || !directions(original).equals(directions(easy))) return false;
        boolean transitContext = ROUTE.matcher(original).find()
                || original.matches("(?s).*(?:호선|버스|지하철|승차|하차|탑승|타요|타세요|내려요|내리세요).*");
        if (!transitContext && easy.matches("(?s).*(?:승차|하차|탑승|타요|타세요|내려요|내리세요).*")) return false;
        // Check all remaining factual words in both directions: no lost name and no invented landmark.
        if (!facts(original).equals(facts(easy))) return false;

        var route = ROUTE.matcher(original);
        while (route.find()) {
            String start = compact(route.group(1)), end = compact(route.group(2));
            String output = compact(easy);
            int startAt = output.indexOf(start), endAt = output.indexOf(end, startAt + start.length());
            if (startAt < 0 || endAt < 0 || start.equals(end)) return false;
            // Keeping the exact A > B expression is safe; otherwise preserve explicit boarding/alighting roles.
            if (easy.replaceAll("\\s+", "").contains(route.group().replaceAll("\\s+", ""))) continue;
            String boarding = output.substring(startAt + start.length(), endAt);
            String alighting = output.substring(endAt + end.length());
            if (!boarding.matches(".*(?:타요|타세요|승차|탑승).*")
                    || boarding.matches(".*(?:내려|내리|하차).*")
                    || !alighting.matches(".*(?:내려|내리|하차).*")
                    || alighting.matches(".*(?:타요|타세요|승차|탑승).*")) return false;
        }
        // A walking destination and a parenthesized road are phrases, not interchangeable bags of words.
        var target = Pattern.compile("^(.+?)까지").matcher(original);
        if (target.find() && !compact(easy).contains(compact(target.group()))) return false;
        var roads = Pattern.compile("\\(([^()<>→]+)\\)").matcher(original);
        while (roads.find()) {
            if (!compact(easy).contains(compact(roads.group(1)))) return false;
        }
        // Preserve the order of arbitrary names too (e.g. CU 편의점 must not become 편의점 CU).
        String namesOriginal = original, namesEasy = easy;
        roads.reset();
        while (roads.find()) {
            namesOriginal = namesOriginal.replace(roads.group(1), " ");
            namesEasy = namesEasy.replace(roads.group(1), " ");
        }
        var originalNames = names(namesOriginal);
        var easyNames = names(namesEasy);
        route.reset();
        if (route.find()) {
            // The line name is allowed to move from the prefix to the boarding sentence.
            for (String lineWord : names(original.substring(0, route.start()))) {
                originalNames.remove(lineWord);
                easyNames.remove(lineWord);
            }
        }
        if (!originalNames.equals(easyNames)) return false;
        if (!ROUTE.matcher(original).find()
                && !ordered(NUMBER, namesOriginal).equals(ordered(NUMBER, namesEasy))) return false;
        return true;
    }

    private static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC).trim();
    }

    private static String compact(String text) {
        return text.replaceAll("[^\\p{L}\\p{N}]", "");
    }

    private static List<String> directions(String text) {
        var values = new ArrayList<String>();
        var matcher = DIRECTION.matcher(text);
        while (matcher.find()) {
            String word = matcher.group();
            values.add(switch (word) {
                case "좌회전", "왼쪽", "좌측" -> "LEFT";
                case "우회전", "오른쪽", "우측" -> "RIGHT";
                case "직진", "앞으로", "곧장", "똑바로" -> "STRAIGHT";
                case "올라", "오르" -> "UP";
                case "내려가", "내리막" -> "DOWN";
                default -> "UTURN";
            });
        }
        return values;
    }

    private static String factText(String text) {
        // Normalize approved linguistic variants without erasing the endings of names such as 강서로.
        text = text.replaceAll("(\\d+)\\s*번(?:\\s*버스)?", "$1")
                .replaceAll("([0-9])\\s+(m|km)(?![\\p{L}])", "$1$2")
                .replaceAll("좌회전(?:하세요|해요)?|왼쪽|좌측", " LEFT ")
                .replaceAll("우회전(?:하세요|해요)?|오른쪽|우측", " RIGHT ")
                .replaceAll("직진(?:하세요|해요)?|앞으로|곧장|똑바로", " STRAIGHT ");
        text = PARTICLE.matcher(text).replaceAll("");
        text = ACTION.matcher(text).replaceAll(" ");
        return text;
    }

    private static Map<String, Integer> facts(String text) {
        return bag(WORD, factText(text));
    }

    private static List<String> names(String text) {
        var words = new ArrayList<String>();
        var matcher = WORD.matcher(factText(text));
        while (matcher.find()) {
            String word = matcher.group();
            if (!word.matches(".*[0-9].*|LEFT|RIGHT|STRAIGHT")) words.add(word);
        }
        return words;
    }

    private static Map<String, Integer> bag(Pattern pattern, String text) {
        Map<String, Integer> result = new TreeMap<>();
        var matcher = pattern.matcher(text);
        while (matcher.find()) result.merge(matcher.group(), 1, Integer::sum);
        return result;
    }

    private static List<String> ordered(Pattern pattern, String text) {
        var result = new ArrayList<String>();
        var matcher = pattern.matcher(text);
        while (matcher.find()) result.add(matcher.group());
        return result;
    }
}
