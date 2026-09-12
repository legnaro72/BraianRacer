"""Small explicit query vocabulary shared by SQL and MongoDB persistence."""
from sqlalchemy import select


class SQLUnitOfWork:
    def __init__(self, session):
        self.session = session

    def __getattr__(self, name):
        return getattr(self.session, name)

    def find(self, model, *, order_by=(), **filters):
        stmt = select(model)
        for name, value in filters.items():
            stmt = stmt.where(getattr(model, name) == value)
        for field in order_by:
            stmt = stmt.order_by(getattr(model, field[1:]).desc() if field.startswith("-")
                                 else getattr(model, field))
        return list(self.session.scalars(stmt))

    def first(self, model, *, order_by=(), **filters):
        rows = self.find(model, order_by=order_by, **filters)
        return rows[0] if rows else None
