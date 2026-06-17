namespace VibeDrive.Api.Models;

public class RouteLoadsContext
{
    public ActiveRouteDto? ActiveRoute { get; set; }
    public IReadOnlyList<FreightLoadDto> ProposedLoads { get; set; } = Array.Empty<FreightLoadDto>();
    public PendingAction? PendingAction { get; set; }
}
