import pytest
from src.tools.definitions.search_tool.executor import EngineeringSpecSearchExecutor
from src.domain.services import CadGenerationService


@pytest.mark.asyncio
async def test_search_executor_product_specs():
    """Verify search executor returns standard specs for real-world products like water tap and nema 23."""
    res_tap = await EngineeringSpecSearchExecutor.search("water tap")
    assert res_tap["status"] == "success"
    assert "envelope_mm" in res_tap["specifications"]
    assert res_tap["specifications"]["envelope_mm"]["height"] == 380.0

    res_nema = await EngineeringSpecSearchExecutor.search("nema 23 motor mount")
    assert res_nema["status"] == "success"
    assert res_nema["specifications"]["hole_spacing_mm"] == 47.14


@pytest.mark.asyncio
async def test_search_executor_material_lookup():
    """Verify search executor looks up physical engineering materials and properties."""
    res_inconel = await EngineeringSpecSearchExecutor.search("density of inconel 718")
    assert res_inconel["status"] == "success"
    assert "material_properties" in res_inconel
    assert res_inconel["material_properties"]["density_kg_m3"] == 8190

    res_steel = await EngineeringSpecSearchExecutor.search("steel 304 tensile strength")
    assert res_steel["status"] == "success"
    assert res_steel["material_properties"]["yield_strength_mpa"] == 215


@pytest.mark.asyncio
async def test_resolve_grounded_constraints_auto_inject():
    """Verify CadGenerationService automatically grounds design prompts lacking explicit dimensions."""
    # Real-world product prompt without explicit dimensions -> should ground
    constraints = await CadGenerationService._resolve_grounded_constraints(
        prompt="Design a commercial water tap",
        constraints=None,
        is_cad_task=True,
    )
    assert "verified_standard_spec" in constraints
    assert constraints["verified_standard_spec"]["envelope"]["height"] == 380.0

    # Custom prompt with explicit dimensions (e.g. 50x50x20mm) -> should not overwrite with default envelope
    custom_constraints = await CadGenerationService._resolve_grounded_constraints(
        prompt="Make a 50x50x20mm custom block",
        constraints=None,
        is_cad_task=True,
    )
    assert "verified_standard_spec" not in custom_constraints
