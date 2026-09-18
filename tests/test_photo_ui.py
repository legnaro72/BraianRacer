"""Exercise production gallery widgets without Drive, Atlas or real photos."""
import ast
from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_supervisor_selection_survives_pagination_and_clear():
    source = (Path(__file__).parents[1] / "app.py").read_text(encoding="utf-8")
    names = {"render_supervisor_selection", "render_supervisor_photo_card", "preview_storage_id"}
    functions = "\n\n".join(ast.get_source_segment(source, node) for node in ast.parse(source).body
                             if isinstance(node, ast.FunctionDef) and node.name in names)
    harness = '''
import streamlit as st
class PhotoError(ValueError): pass
def cached_photo_bytes(key): raise PhotoError("Offline test")
photos = [dict(id=str(i), filename=f"foto{i}.jpg", nickname="Ospite", tag="1234",
               storage_id=str(i), approved=False) for i in range(20)]
'''
    app = AppTest.from_string(harness + functions + "\nrender_supervisor_selection(None, photos)")
    app.run()
    assert not app.exception
    assert len(app.checkbox) == 9
    app.checkbox[0].check().run()
    app.number_input[0].set_value(2).run()
    assert "0" in app.session_state.supervisor_selected_ids
    app.checkbox[0].check().run()
    app.number_input[0].set_value(1).run()
    assert app.checkbox[0].value
    assert app.session_state.supervisor_selected_ids == {"0", "9"}
    app.button[0].click().run()
    assert len(app.session_state.supervisor_selected_ids) == 20
    app.button[1].click().run()
    assert not app.session_state.supervisor_selected_ids
    assert not any(box.value for box in app.checkbox)
    assert not app.exception
