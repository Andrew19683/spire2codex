using System.Collections;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using Godot;
using MegaCrit.Sts2.Core.Modding;
using MegaCrit.Sts2.Core.Models;

namespace Spire2CodexExporter;

[ModInitializer("Initialize")]
public static class Exporter
{
    public const string OutputFileName = "spire2codex-runtime-cards.json";
    private static bool _finished;
    private static int _attempts;

    public static void Initialize()
    {
        var tree = (SceneTree)Engine.GetMainLoop();
        tree.Connect(SceneTree.SignalName.ProcessFrame, Callable.From(TryExport));
        GD.Print("[Spire2Codex] Catalog exporter loaded; waiting for ModelDb.");
    }

    private static void TryExport()
    {
        if (_finished) return;
        _attempts++;

        try
        {
            var cards = ModelDb.AllCards.Cast<object>().ToList();
            var pools = ModelDb.AllCardPools.Cast<object>().ToList();
            if (cards.Count == 0 || pools.Count == 0) return;

            var poolsByCard = BuildPoolMemberships(pools);
            var exported = cards
                .Select(card => ExportCard(card, poolsByCard))
                .OrderBy(card => card.SourceId, StringComparer.Ordinal)
                .ToList();

            var result = new RuntimeExport
            {
                Complete = true,
                Cards = exported,
            };
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            };
            var outputPath = Path.Combine(Path.GetTempPath(), OutputFileName);
            File.WriteAllText(outputPath, JsonSerializer.Serialize(result, options) + System.Environment.NewLine);
            _finished = true;
            GD.Print($"[Spire2Codex] Exported {exported.Count} cards to {outputPath}");
        }
        catch (Exception ex)
        {
            // During startup ModelDb properties can throw until Init/InitIds finish.
            if (_attempts % 300 == 0)
                GD.Print($"[Spire2Codex] Still waiting for ModelDb: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static Dictionary<string, SortedSet<string>> BuildPoolMemberships(IEnumerable<object> pools)
    {
        var result = new Dictionary<string, SortedSet<string>>(StringComparer.Ordinal);
        foreach (var pool in pools)
        {
            var poolId = ReadId(pool);
            var poolCards = ReadMember(pool, "AllCards") as IEnumerable;
            if (poolCards == null) continue;
            foreach (var card in poolCards)
            {
                if (card == null) continue;
                var cardId = ReadId(card);
                if (!result.TryGetValue(cardId, out var ids))
                {
                    ids = new SortedSet<string>(StringComparer.Ordinal);
                    result[cardId] = ids;
                }
                ids.Add(poolId);
            }
        }
        return result;
    }

    private static RuntimeCard ExportCard(object card, IReadOnlyDictionary<string, SortedSet<string>> poolsByCard)
    {
        var sourceId = ReadId(card);
        var poolIds = poolsByCard.TryGetValue(sourceId, out var memberships)
            ? memberships.ToList()
            : [];
        var visualPool = ReadMember(card, "VisualCardPool");

        return new RuntimeCard
        {
            SourceId = sourceId,
            Type = ReadEnum(card, "Type", "CardType"),
            Rarity = ReadEnum(card, "Rarity", "CardRarity").ToLowerInvariant(),
            PoolIds = poolIds,
            CardColor = visualPool == null ? poolIds.FirstOrDefault() : ReadId(visualPool),
            InCanonicalPool = poolIds.Count > 0,
            ShowInCardLibrary = ReadBool(card, "ShouldShowInCardLibrary", true),
            MultiplayerConstraint = ReadEnum(card, "MultiplayerConstraint"),
        };
    }

    private static object? ReadMember(object target, params string[] names)
    {
        var type = target.GetType();
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        foreach (var name in names)
        {
            var property = type.GetProperty(name, flags);
            if (property != null && property.GetIndexParameters().Length == 0) return property.GetValue(target);
            var field = type.GetField(name, flags);
            if (field != null) return field.GetValue(target);
        }
        return null;
    }

    private static string ReadId(object target)
    {
        var id = ReadMember(target, "Id") ?? throw new InvalidOperationException($"{target.GetType().FullName} has no Id");
        return (ReadMember(id, "Entry") ?? id).ToString()
            ?? throw new InvalidOperationException($"{target.GetType().FullName} has an empty Id");
    }

    private static string ReadEnum(object target, params string[] names)
    {
        var value = ReadMember(target, names);
        return value?.ToString() ?? throw new InvalidOperationException(
            $"{target.GetType().FullName} is missing {string.Join("/", names)}");
    }

    private static bool ReadBool(object target, string name, bool fallback)
    {
        return ReadMember(target, name) is bool value ? value : fallback;
    }

    private sealed class RuntimeExport
    {
        public bool Complete { get; init; }
        public required List<RuntimeCard> Cards { get; init; }
    }

    private sealed class RuntimeCard
    {
        public required string SourceId { get; init; }
        public required string Type { get; init; }
        public required string Rarity { get; init; }
        public string? CardColor { get; init; }
        public required List<string> PoolIds { get; init; }
        public bool InCanonicalPool { get; init; }
        public bool ShowInCardLibrary { get; init; }
        public required string MultiplayerConstraint { get; init; }
    }
}
