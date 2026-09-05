using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishReadingPlatform.Migrations
{
    /// <inheritdoc />
    public partial class OcrScannedAtIndeksi : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_OcrRecords_ScannedAt",
                table: "OcrRecords",
                column: "ScannedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_OcrRecords_ScannedAt",
                table: "OcrRecords");
        }
    }
}
