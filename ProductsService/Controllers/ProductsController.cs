using Microsoft.AspNetCore.Mvc;

namespace ProductsService.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class ProductsController : ControllerBase
{
    private static readonly object Lock = new();
    private static readonly List<Product> Products =
    [
        new Product(1, "Keyboard", 49.99m),
        new Product(2, "USB Cable", 9.99m)
    ];
    private static int _nextId = 3;

    [HttpGet]
    public IActionResult GetAll()
    {
        lock (Lock)
        {
            return Ok(Products.ToArray());
        }
    }

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        lock (Lock)
        {
            var product = Products.FirstOrDefault(item => item.Id == id);
            return product is null ? NotFound() : Ok(product);
        }
    }

    [HttpPost]
    public IActionResult Create(ProductInput input)
    {
        lock (Lock)
        {
            var product = new Product(_nextId++, input.Name, input.Price);
            Products.Add(product);
            return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
        }
    }

    [HttpPut("{id:int}")]
    public IActionResult Update(int id, ProductInput input)
    {
        lock (Lock)
        {
            var index = Products.FindIndex(item => item.Id == id);
            if (index < 0)
            {
                return NotFound();
            }

            Products[index] = new Product(id, input.Name, input.Price);
            return NoContent();
        }
    }

    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        lock (Lock)
        {
            var product = Products.FirstOrDefault(item => item.Id == id);
            if (product is null)
            {
                return NotFound();
            }

            Products.Remove(product);
            return NoContent();
        }
    }

    public sealed record Product(int Id, string Name, decimal Price);
    public sealed record ProductInput(string Name, decimal Price);
}
