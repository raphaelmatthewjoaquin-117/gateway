var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5002");
builder.Services.AddControllers();

var app = builder.Build();
app.MapControllers();
app.Run();
