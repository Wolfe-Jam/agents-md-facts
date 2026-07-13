from main import greet


def test_greet() -> None:
    assert greet("world") == "Hello, world!"
