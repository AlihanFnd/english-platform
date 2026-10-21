using System.Text.RegularExpressions;

namespace EnglishReadingPlatform.Validation;

public static class IngilizceKok
{
    private static readonly HashSet<string> NonStemmableWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "news", "bus", "this", "yes", "gas", "glass", "boss", "less", "miss", "press",
        "pass", "cross", "class", "grass", "dress", "chess", "address", "process", "access",
        "success", "express", "possess", "discuss", "guess", "bless", "mess", "loss", "moss",
        "boss", "gloss", "floss", "toss", "across", "canvas", "bias", "alias", "atlas",
        "compass", "embarrass", "harass", "virus", "status", "focus", "radius", "bonus",
        "circus", "genus", "minus", "plus", "thus", "us", "as", "his", "its", "these",
        "those", "is", "was", "has", "does", "series", "species", "chaos", "lens", "corps",
        "means", "ethics", "physics", "maths", "politics", "economics", "better", "best",
        "worse", "worst", "more", "most", "least", "bigger", "biggest", "smaller", "smallest",
        "faster", "fastest", "older", "oldest", "younger", "youngest", "longer", "longest",
        "shorter", "shortest", "higher", "highest", "lower", "lowest", "greater", "greatest"
    };

    private static readonly Dictionary<string, string> IrregularMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // Irregular plurals
        ["children"] = "child",
        ["men"] = "man",
        ["women"] = "woman",
        ["feet"] = "foot",
        ["teeth"] = "tooth",
        ["mice"] = "mouse",
        ["geese"] = "goose",
        ["people"] = "person",
        ["oxen"] = "ox",
        ["lives"] = "life",
        ["knives"] = "knife",
        ["wives"] = "wife",
        ["leaves"] = "leaf",
        ["halves"] = "half",
        ["wolves"] = "wolf",
        ["thieves"] = "thief",
        ["calves"] = "calf",
        ["elves"] = "elf",
        ["shelves"] = "shelf",

        // Irregular verbs
        ["went"] = "go", ["gone"] = "go", ["going"] = "go", ["goes"] = "go",
        ["was"] = "be", ["were"] = "be", ["been"] = "be", ["being"] = "be", ["am"] = "be", ["are"] = "be",
        ["did"] = "do", ["done"] = "do", ["doing"] = "do", ["does"] = "do",
        ["had"] = "have", ["has"] = "have", ["having"] = "have",
        ["said"] = "say", ["says"] = "say", ["saying"] = "say",
        ["made"] = "make", ["makes"] = "make", ["making"] = "make",
        ["took"] = "take", ["taken"] = "take", ["takes"] = "take", ["taking"] = "take",
        ["came"] = "come", ["comes"] = "come", ["coming"] = "come",
        ["saw"] = "see", ["seen"] = "see", ["sees"] = "see", ["seeing"] = "see",
        ["knew"] = "know", ["known"] = "know", ["knows"] = "know", ["knowing"] = "know",
        ["got"] = "get", ["gotten"] = "get", ["gets"] = "get", ["getting"] = "get",
        ["gave"] = "give", ["given"] = "give", ["gives"] = "give", ["giving"] = "give",
        ["found"] = "find", ["finds"] = "find", ["finding"] = "find",
        ["thought"] = "think", ["thinks"] = "think", ["thinking"] = "think",
        ["told"] = "tell", ["tells"] = "tell", ["telling"] = "tell",
        ["became"] = "become", ["becomes"] = "become", ["becoming"] = "become",
        ["left"] = "leave", ["leaves"] = "leave", ["leaving"] = "leave",
        ["felt"] = "feel", ["feels"] = "feel", ["feeling"] = "feel",
        ["brought"] = "bring", ["brings"] = "bring", ["bringing"] = "bring",
        ["began"] = "begin", ["begun"] = "begin", ["begins"] = "begin", ["beginning"] = "begin",
        ["kept"] = "keep", ["keeps"] = "keep", ["keeping"] = "keep",
        ["held"] = "hold", ["holds"] = "hold", ["holding"] = "hold",
        ["wrote"] = "write", ["written"] = "write", ["writes"] = "write", ["writing"] = "write",
        ["stood"] = "stand", ["stands"] = "stand", ["standing"] = "stand",
        ["heard"] = "hear", ["hears"] = "hear", ["hearing"] = "hear",
        ["meant"] = "mean", ["means"] = "mean", ["meaning"] = "mean",
        ["met"] = "meet", ["meets"] = "meet", ["meeting"] = "meet",
        ["ran"] = "run", ["runs"] = "run", ["running"] = "run",
        ["paid"] = "pay", ["pays"] = "pay", ["paying"] = "pay",
        ["sat"] = "sit", ["sits"] = "sit", ["sitting"] = "sit",
        ["spoke"] = "speak", ["spoken"] = "speak", ["speaks"] = "speak", ["speaking"] = "speak",
        ["lay"] = "lie", ["lain"] = "lie", ["lies"] = "lie", ["lying"] = "lie",
        ["led"] = "lead", ["leads"] = "lead", ["leading"] = "lead",
        ["grew"] = "grow", ["grown"] = "grow", ["grows"] = "grow", ["growing"] = "grow",
        ["lost"] = "lose", ["loses"] = "lose", ["losing"] = "lose",
        ["fell"] = "fall", ["fallen"] = "fall", ["falls"] = "fall", ["falling"] = "fall",
        ["sent"] = "send", ["sends"] = "send", ["sending"] = "send",
        ["built"] = "build", ["builds"] = "build", ["building"] = "build",
        ["understood"] = "understand", ["understands"] = "understand", ["understanding"] = "understand",
        ["drew"] = "draw", ["drawn"] = "draw", ["draws"] = "draw", ["drawing"] = "draw",
        ["spent"] = "spend", ["spends"] = "spend", ["spending"] = "spend",
        ["rose"] = "rise", ["risen"] = "rise", ["rises"] = "rise", ["rising"] = "rise",
        ["drove"] = "drive", ["driven"] = "drive", ["drives"] = "drive", ["driving"] = "drive",
        ["bought"] = "buy", ["buys"] = "buy", ["buying"] = "buy",
        ["wore"] = "wear", ["worn"] = "wear", ["wears"] = "wear", ["wearing"] = "wear",
        ["chose"] = "choose", ["chosen"] = "choose", ["chooses"] = "choose", ["choosing"] = "choose",
        ["sought"] = "seek", ["seeks"] = "seek", ["seeking"] = "seek",
        ["caught"] = "catch", ["catches"] = "catch", ["catching"] = "catch",
        ["dealt"] = "deal", ["deals"] = "deal", ["dealing"] = "deal",
        ["won"] = "win", ["wins"] = "win", ["winning"] = "win",
        ["forgot"] = "forget", ["forgotten"] = "forget", ["forgets"] = "forget", ["forgetting"] = "forget",
        ["laid"] = "lay", ["lays"] = "lay", ["laying"] = "lay",
        ["fled"] = "flee", ["flees"] = "flee", ["fleeing"] = "flee",
        ["swam"] = "swim", ["swims"] = "swim", ["swimming"] = "swim",
        ["shone"] = "shine", ["shines"] = "shine", ["shining"] = "shine",
        ["sang"] = "sing", ["sung"] = "sing", ["sings"] = "sing", ["singing"] = "sing",
        ["blew"] = "blow", ["blown"] = "blow", ["blows"] = "blow", ["blowing"] = "blow",
        ["flew"] = "fly", ["flown"] = "fly", ["flies"] = "fly", ["flying"] = "fly",
        ["drank"] = "drink", ["drunk"] = "drink", ["drinks"] = "drink", ["drinking"] = "drink",
        ["threw"] = "throw", ["thrown"] = "throw", ["throws"] = "throw", ["throwing"] = "throw",
        ["rode"] = "ride", ["ridden"] = "ride", ["rides"] = "ride", ["riding"] = "ride",
        ["ate"] = "eat", ["eaten"] = "eat", ["eats"] = "eat", ["eating"] = "eat",
        ["beat"] = "beat", ["beaten"] = "beat", ["beats"] = "beat", ["beating"] = "beat",
        ["bit"] = "bite", ["bitten"] = "bite", ["bites"] = "bite", ["biting"] = "bite",
        ["hid"] = "hide", ["hidden"] = "hide", ["hides"] = "hide", ["hiding"] = "hide",
        ["rang"] = "ring", ["rung"] = "ring", ["rings"] = "ring", ["ringing"] = "ring",
        ["sank"] = "sink", ["sunk"] = "sink", ["sinks"] = "sink", ["sinking"] = "sink",
        ["slept"] = "sleep", ["sleeps"] = "sleep", ["sleeping"] = "sleep",
        ["woke"] = "wake", ["woken"] = "wake", ["wakes"] = "wake", ["waking"] = "wake",
        ["stole"] = "steal", ["stolen"] = "steal", ["steals"] = "steal", ["stealing"] = "steal",
        ["broke"] = "break", ["broken"] = "break", ["breaks"] = "break", ["breaking"] = "break",
        ["sold"] = "sell", ["sells"] = "sell", ["selling"] = "sell",
        ["shot"] = "shoot", ["shoots"] = "shoot", ["shooting"] = "shoot",
        ["hung"] = "hang", ["hangs"] = "hang", ["hanging"] = "hang",
        ["taught"] = "teach", ["teaches"] = "teach", ["teaching"] = "teach",
        ["fought"] = "fight", ["fights"] = "fight", ["fighting"] = "fight"
    };

    /// <summary>
    /// YH-11: Kural tabanlı İngilizce kök bulucu. Güven düşükse null döndürür.
    /// Kök kelimenin kendisiyle aynıysa veya kök bulunamazsa null döner.
    /// </summary>
    public static string? KokBul(string? girdi)
    {
        var w = KelimeNormallestirici.Normallestir(girdi);
        if (string.IsNullOrWhiteSpace(w) || w.Length < 3) return null;

        // İstisnalar
        if (NonStemmableWords.Contains(w)) return null;

        // Düzensiz kelime haritası
        if (IrregularMap.TryGetValue(w, out var irregularRoot))
        {
            return irregularRoot.Equals(w, StringComparison.OrdinalIgnoreCase) ? null : irregularRoot;
        }

        string? kok = null;

        // 1. -ies -> y (stories -> story, studies -> study, cities -> city)
        if (w.EndsWith("ies") && w.Length > 4)
        {
            kok = w[..^3] + "y";
        }
        // 2. -ied -> y (studied -> study, carried -> carry)
        else if (w.EndsWith("ied") && w.Length > 4)
        {
            kok = w[..^3] + "y";
        }
        // 3. -es (boxes -> box, watches -> watch, wishes -> wish, buses -> bus, passes -> pass)
        else if (w.EndsWith("es") && w.Length > 4 && (w.EndsWith("shes") || w.EndsWith("ches") || w.EndsWith("xes") || w.EndsWith("zes") || w.EndsWith("sses")))
        {
            kok = w[..^2];
        }
        // 4. -ed
        else if (w.EndsWith("ed") && w.Length > 4)
        {
            // Çift ünsüz: stopped -> stop, planned -> plan, robbed -> rob
            if (CiftUnsuzMu(w, w.Length - 3))
            {
                kok = w[..^3];
            }
            // Sessiz e: loved -> love, liked -> like, moved -> move, saved -> save
            else if (SessizESonlamaGerektirirMi(w[..^2]))
            {
                kok = w[..^1]; // remove 'd'
            }
            // Düz -ed: played -> play, worked -> work, opened -> open
            else
            {
                kok = w[..^2];
            }
        }
        // 5. -ing
        else if (w.EndsWith("ing") && w.Length > 4)
        {
            // Çift ünsüz: running -> run, swimming -> swim, stopping -> stop
            if (CiftUnsuzMu(w, w.Length - 4))
            {
                kok = w[..^4];
            }
            // Sessiz e: making -> make, writing -> write, taking -> take, loving -> love, coming -> come
            else if (SessizESonlamaGerektirirMi(w[..^3]))
            {
                kok = w[..^3] + "e";
            }
            // Düz -ing: reading -> read, playing -> play, working -> work, going -> go
            else
            {
                kok = w[..^3];
            }
        }
        // 6. -s (loves -> love, books -> book, cats -> cat, makes -> make, writes -> write)
        else if (w.EndsWith("s") && w.Length > 3 && !w.EndsWith("ss") && !w.EndsWith("us") && !w.EndsWith("is") && !w.EndsWith("as"))
        {
            // loves -> love (if stems to love)
            if (w.EndsWith("ves") && w.Length > 4)
            {
                kok = w[..^1]; // loves -> love
            }
            else
            {
                kok = w[..^1];
            }
        }

        if (string.IsNullOrWhiteSpace(kok) || kok.Equals(w, StringComparison.OrdinalIgnoreCase) || kok.Length < 2)
        {
            return null;
        }

        return kok;
    }

    private static bool CiftUnsuzMu(string str, int index)
    {
        if (index < 1 || index >= str.Length) return false;
        char c1 = str[index - 1];
        char c2 = str[index];
        return c1 == c2 && "bdfgklmnprstz".Contains(c1);
    }

    private static bool SessizESonlamaGerektirirMi(string stemWithoutEdOrIng)
    {
        if (string.IsNullOrEmpty(stemWithoutEdOrIng) || stemWithoutEdOrIng.Length < 2) return false;
        // e.g. lov -> love, mak -> make, writ -> write, tak -> take, com -> come, giv -> give, hav -> have, liv -> live, driv -> drive, hop -> hope, us -> use, clos -> close, mov -> move, sav -> save, lik -> like, smil -> smile
        return Regex.IsMatch(stemWithoutEdOrIng, @"[bcdfghklmnprstvwz][a-z]?$", RegexOptions.IgnoreCase) &&
               !Regex.IsMatch(stemWithoutEdOrIng, @"(e|o|a|u|i){2}", RegexOptions.IgnoreCase) &&
               !Regex.IsMatch(stemWithoutEdOrIng, @"(ck|ng|th|sh|ch|rt|rn|rk|lp|l|r)$", RegexOptions.IgnoreCase);
    }
}
