namespace VibeDrive.Api.Options;

public class PendingActionOptions
{
    public const string SectionName = "PendingAction";

    public int TtlMinutes { get; set; } = 7;
}
