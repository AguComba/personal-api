-- RF-N5: búsqueda full-text sobre el título y el contenido de las notas.
--
-- Esta migración se escribe a mano (`drizzle-kit generate --custom`) porque la
-- tabla virtual y sus triggers no se pueden expresar en el schema TS. Como el
-- diff se hace contra ese schema, ninguna migración futura intenta corregirlos.
--
-- `content='note'` la hace una tabla de contenido externo: guarda solo el índice
-- invertido y va a buscar el texto a `note`, en vez de duplicarlo. El precio es
-- que la sincronización corre por cuenta nuestra, de ahí los tres triggers.
--
-- `remove_diacritics 2` es lo que hace que buscar "cafe" encuentre "café". Sin
-- eso la búsqueda en español falla en la mitad de los casos.
CREATE VIRTUAL TABLE `note_fts` USING fts5(
	title,
	content,
	content='note',
	content_rowid='id',
	tokenize="unicode61 remove_diacritics 2"
);
--> statement-breakpoint
CREATE TRIGGER `note_fts_insertar` AFTER INSERT ON `note` BEGIN
	INSERT INTO `note_fts`(`rowid`, `title`, `content`)
	VALUES (new.`id`, new.`title`, new.`content`);
END;
--> statement-breakpoint
-- En una tabla de contenido externo, borrar del índice es insertar una fila
-- 'delete' con los valores viejos: FTS5 ya no puede leerlos de `note` porque la
-- fila original no está más.
CREATE TRIGGER `note_fts_borrar` AFTER DELETE ON `note` BEGIN
	INSERT INTO `note_fts`(`note_fts`, `rowid`, `title`, `content`)
	VALUES ('delete', old.`id`, old.`title`, old.`content`);
END;
--> statement-breakpoint
CREATE TRIGGER `note_fts_actualizar` AFTER UPDATE ON `note` BEGIN
	INSERT INTO `note_fts`(`note_fts`, `rowid`, `title`, `content`)
	VALUES ('delete', old.`id`, old.`title`, old.`content`);
	INSERT INTO `note_fts`(`rowid`, `title`, `content`)
	VALUES (new.`id`, new.`title`, new.`content`);
END;
--> statement-breakpoint
-- Indexa lo que ya estuviera cargado. Hoy no hay ninguna nota, pero sin esto la
-- migración solo serviría en una base vacía.
INSERT INTO `note_fts`(`note_fts`) VALUES ('rebuild');
