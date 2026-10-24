using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

namespace AuthService.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class AuthController(IConfiguration configuration) : ControllerBase
{
    [HttpPost("login")]
    public IActionResult Login(LoginRequest request)
    {
        var expectedUsername = configuration["DemoCredentials:Username"]
            ?? throw new InvalidOperationException("DemoCredentials:Username is not configured.");
        var expectedPassword = configuration["DemoCredentials:Password"]
            ?? throw new InvalidOperationException("DemoCredentials:Password is not configured.");

        if (request.Username != expectedUsername || request.Password != expectedPassword)
        {
            return Unauthorized(new { message = "Invalid username or password." });
        }

        var key = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        var issuer = configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("Jwt:Issuer is not configured.");
        var audience = configuration["Jwt:Audience"]
            ?? throw new InvalidOperationException("Jwt:Audience is not configured.");

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer,
            audience,
            [new Claim(ClaimTypes.Name, request.Username)],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: credentials);

        return Ok(new
        {
            token = new JwtSecurityTokenHandler().WriteToken(token),
            tokenType = "Bearer",
            expiresIn = 3600
        });
    }

    public sealed record LoginRequest(string Username, string Password);
}
