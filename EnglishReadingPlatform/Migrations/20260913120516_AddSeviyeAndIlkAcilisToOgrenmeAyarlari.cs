using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class AddSeviyeAndIlkAcilisToOgrenmeAyarlari : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IlkAcilisTamamlandi",
                table: "OgrenmeAyarlari",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Seviye",
                table: "OgrenmeAyarlari",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IlkAcilisTamamlandi",
                table: "OgrenmeAyarlari");

            migrationBuilder.DropColumn(
                name: "Seviye",
                table: "OgrenmeAyarlari");
        }
    }
}
